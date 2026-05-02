import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EventType, EventsPayloads } from '../../common/events';
import { AssetClass, LedgerEntryType } from '../../common/enums';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  I_EXCHANGE_PROVIDER,
  IExchangeProvider,
  ITradeAssetRequest,
} from '../../common/interfaces/exchange-provider.interface';
import {
  ALLOCATION_GOLD_BPS,
  ALLOCATION_INDEX_FUND_BPS,
  ALLOCATION_HIGH_RISK_BPS,
} from '../../common/constants/allocation.constant';
import { ASSET_UNIT_PRECISION } from '../../common/constants/asset-unit-precision.constant';
import { WalletService } from '../wallet/wallet.service';
import { InvestAmountDto } from './dtos/invest-amount.dto';
import { SellAssetDto } from './dtos/sell-asset.dto';

/** Allocation split definition. */
interface AllocationSlice {
  assetClass: AssetClass;
  bps: number;
}

const ALLOCATION_PLAN: readonly AllocationSlice[] = [
  { assetClass: AssetClass.GOLD, bps: ALLOCATION_GOLD_BPS },
  { assetClass: AssetClass.INDEX_FUND, bps: ALLOCATION_INDEX_FUND_BPS },
  { assetClass: AssetClass.HIGH_RISK, bps: ALLOCATION_HIGH_RISK_BPS },
] as const;

/**
 * InvestmentService — Handles:
 *   1. Asset allocation: listens to FUNDS_READY_FOR_INVESTMENT, splits net funds
 *      across the 24/75/1 allocation, buys each asset via the ExchangeProvider.
 *   2. Selling: synchronously sells asset positions via the ExchangeProvider
 *      (called by the RedemptionOrchestrator).
 */
@Injectable()
export class InvestmentService {
  private readonly logger = new Logger(InvestmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly walletService: WalletService,
    @Inject(I_EXCHANGE_PROVIDER)
    private readonly exchange: IExchangeProvider,
  ) {}

  // ─── Manual Invest (User-Initiated) ─────────────────────────────────────

  /**
   * Allows a user with an existing fiat balance to invest a specific amount.
   *
   * Flow:
   *   1. Validate & debit gross amount from the user's wallet (OCC + ledger).
   *   2. Emit WALLET_FUNDS_ROUNDUP → FeeEngine deducts FUND_FEE → emits
   *      FUNDS_READY_FOR_INVESTMENT → onFundsReady allocates across the 24/75/1 split.
   *
   * Idempotency: the client-supplied key is forwarded through the entire pipeline.
   */
  async investAmount(
    params: InvestAmountDto,
  ): Promise<{ queued: true; grossAmount: string; idempotencyKey: string }> {
    const { userId, grossAmount, idempotencyKey } = params;

    // 1. Resolve wallet
    const wallet = await this.walletService.getWalletByUserId(userId);

    // 2. Debit the gross amount from fiat balance (throws on insufficient funds)
    await this.walletService.debitFiat({
      userId,
      walletId: wallet.id,
      amount: grossAmount,
      idempotencyKey: `invest:debit:${idempotencyKey}`,
      note: `Manual invest: ${grossAmount.amount} → fee pipeline`,
    });

    // 3. Fire WALLET_FUNDS_ROUNDUP — FeeEngine listener handles the rest
    this.events.emit(EventType.SystemEventType.WALLET_FUNDS_ROUNDUP, {
      userId,
      walletId: wallet.id,
      transactionEventId: idempotencyKey,
      transactionId: idempotencyKey,
      grossAmount,
      idempotencyKey,
    } satisfies EventsPayloads.RoundupDebitedEventPayload);

    this.logger.log(
      `Invest queued: ${grossAmount.amount} for user ${userId} (key: ${idempotencyKey})`,
    );

    return {
      queued: true,
      grossAmount: grossAmount.amount.toString(),
      idempotencyKey,
    };
  }

  // ─── Event Listener: Allocate assets on FUNDS_READY_FOR_INVESTMENT ───────

  @OnEvent(EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT)
  async onFundsReady(
    payload: EventsPayloads.FundsReadyForInvestmentEventPayload,
  ): Promise<void> {
    const { userId, walletId, netAmount, idempotencyKey, transactionEventId } =
      payload;
    this.logger.log(
      `Allocating ${netAmount.amount} across assets for user ${userId}`,
    );

    const wallet = await this.prisma.digitalWallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    for (const slice of ALLOCATION_PLAN) {
      const sliceAmount = netAmount.multiplyByBps(slice.bps);

      if (sliceAmount.isZero()) {
        this.logger.warn(
          `Skipping ${slice.assetClass}: allocation amount is zero`,
        );
        continue;
      }

      const sliceIdempotencyKey = `${idempotencyKey}:buy:${slice.assetClass}`;

      try {
        // 1. Get current price for this asset
        const unitPrice = await this.exchange.getLatestPrice(slice.assetClass);

        // 2. Calculate how many units we can buy
        //    units = (sliceAmount * ASSET_UNIT_PRECISION) / unitPrice
        const units =
          (sliceAmount.amount * ASSET_UNIT_PRECISION) / unitPrice.amount;

        if (units <= 0n) {
          this.logger.warn(
            `Skipping ${slice.assetClass}: calculated units is zero`,
          );
          continue;
        }

        // 3. Execute buy order on exchange
        const buyRequest: ITradeAssetRequest = {
          userId,
          assetClass: slice.assetClass,
          units,
          totalCost: sliceAmount,
          idempotencyKey: sliceIdempotencyKey,
        };
        const buyResult = await this.exchange.buyAsset(buyRequest);

        if (!buyResult.success) {
          this.logger.error(
            `BUY failed for ${slice.assetClass}: ${buyResult.message}`,
          );
          continue;
        }

        const executedUnits = buyResult.executedUnits ?? units;
        const executionPrice = buyResult.executionPrice ?? unitPrice;

        // 4. Atomic: deduct fiat from wallet, upsert position, post ledger entry
        await this.prisma.$transaction(async (tx) => {
          // Deduct fiat
          const walletUpdate = await tx.digitalWallet.updateMany({
            where: { id: walletId, version: wallet.version },
            data: {
              fiatBalance: { decrement: sliceAmount.amount },
              version: { increment: 1 },
            },
          });
          if (walletUpdate.count === 0) {
            throw new Error(
              'Concurrency conflict: wallet version mismatch during allocation',
            );
          }

          // Upsert wallet position (update average buy price using WAC)
          const existingPosition = await tx.walletPosition.findUnique({
            where: {
              walletId_assetClass: { walletId, assetClass: slice.assetClass },
            },
          });

          if (existingPosition) {
            // WAC = (existingUnits * existingAvg + newUnits * newPrice) / (existingUnits + newUnits)
            const totalCostBasis =
              existingPosition.totalUnits * existingPosition.averageBuyPrice +
              executedUnits * executionPrice.amount;
            const totalUnits = existingPosition.totalUnits + executedUnits;
            const newAvgPrice =
              totalUnits > 0n ? totalCostBasis / totalUnits : 0n;

            await tx.walletPosition.update({
              where: {
                walletId_assetClass: {
                  walletId,
                  assetClass: slice.assetClass,
                },
              },
              data: {
                totalUnits,
                averageBuyPrice: newAvgPrice,
              },
            });
          } else {
            await tx.walletPosition.create({
              data: {
                walletId,
                assetClass: slice.assetClass,
                totalUnits: executedUnits,
                averageBuyPrice: executionPrice.amount,
              },
            });
          }

          // Post INVESTMENT_ALLOCATION ledger entry
          await tx.ledgerEntry.create({
            data: {
              userId,
              walletId,
              type: LedgerEntryType.INVESTMENT_ALLOCATION,
              amount: sliceAmount.amount,
              currency: sliceAmount.currency,
              assetClass: slice.assetClass,
              assetUnits: executedUnits,
              executionPrice: executionPrice.amount,
              transactionEventId,
              idempotencyKey: sliceIdempotencyKey,
              note: `BUY ${slice.assetClass}: ${executedUnits} units @ ${executionPrice.amount}`,
            },
          });
        });

        // 5. Emit TRADE_ORDER_EXECUTED for dashboard/SSE
        this.events.emit(EventType.SystemEventType.TRADE_ORDER_EXECUTED, {
          userId,
          transactionId: buyResult.transactionId ?? sliceIdempotencyKey,
          orderId: buyResult.transactionId ?? sliceIdempotencyKey,
          idempotencyKey: sliceIdempotencyKey,
          asset: slice.assetClass,
          assetPrice: executionPrice,
          orderQuantity: executedUnits,
          timestamp: new Date(),
        } satisfies EventsPayloads.TradeOrderExecutedEventPayload);

        this.logger.log(
          `Allocated ${slice.assetClass}: ${executedUnits} units @ ${executionPrice.amount}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to allocate ${slice.assetClass} for user ${userId}: ${err}`,
        );
        // Individual asset failure should not abort the entire allocation
      }
    }
  }

  // ─── Synchronous Sell (called by RedemptionOrchestrator) ─────────────────

  /**
   * Sells a specific number of units of an asset class.
   * Returns the realized fiat value after the exchange confirms the sell.
   *
   * Steps:
   *   1. Validate the user has enough units in their position.
   *   2. Execute sell on the exchange.
   *   3. Atomically: reduce position, post ledger entry.
   *   4. Return the realized fiat value (proceeds).
   */
  async sellAsset(params: SellAssetDto): Promise<{
    proceeds: Money;
    executionPrice: Money;
    executedUnits: bigint;
    averageBuyPrice: bigint;
  }> {
    const { userId, walletId, assetClass, units, idempotencyKey } = params;

    // 1. Validate position
    const position = await this.prisma.walletPosition.findUnique({
      where: { walletId_assetClass: { walletId, assetClass } },
    });

    if (!position || position.totalUnits < units) {
      throw new BadRequestException(
        `Insufficient ${assetClass} position. Available: ${position?.totalUnits ?? 0n}, Requested: ${units}`,
      );
    }

    // 2. Get current market price and execute sell
    const unitPrice = await this.exchange.getLatestPrice(assetClass);
    const estimatedProceeds = Money.fromMinorUnit(
      (units * unitPrice.amount) / ASSET_UNIT_PRECISION,
      unitPrice.currency,
    );

    const sellResult = await this.exchange.sellAsset({
      userId,
      assetClass,
      units,
      totalCost: estimatedProceeds,
      idempotencyKey,
    });

    if (!sellResult.success) {
      throw new Error(
        `Exchange SELL failed for ${assetClass}: ${sellResult.message}`,
      );
    }

    const executedUnits = sellResult.executedUnits ?? units;
    const executionPrice = sellResult.executionPrice ?? unitPrice;
    const proceeds =
      sellResult.totalCost ??
      Money.fromMinorUnit(
        (executedUnits * executionPrice.amount) / ASSET_UNIT_PRECISION,
        executionPrice.currency,
      );

    // 3. Atomic: reduce position, post INVESTMENT_REDEMPTION ledger entry
    await this.prisma.$transaction(async (tx) => {
      const newTotalUnits = position.totalUnits - executedUnits;

      await tx.walletPosition.update({
        where: { walletId_assetClass: { walletId, assetClass } },
        data: {
          totalUnits: newTotalUnits,
          // WAC (averageBuyPrice) stays the same on sells
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId,
          walletId,
          type: LedgerEntryType.INVESTMENT_REDEMPTION,
          amount: proceeds.amount,
          currency: proceeds.currency,
          assetClass,
          assetUnits: executedUnits,
          executionPrice: executionPrice.amount,
          idempotencyKey: `${idempotencyKey}:sell`,
          note: `SELL ${assetClass}: ${executedUnits} units @ ${executionPrice.amount}`,
        },
      });
    });

    this.logger.log(
      `Sold ${executedUnits} ${assetClass} units for ${proceeds.amount} (user: ${userId})`,
    );

    return {
      proceeds,
      executionPrice,
      executedUnits,
      averageBuyPrice: position.averageBuyPrice,
    };
  }
}
