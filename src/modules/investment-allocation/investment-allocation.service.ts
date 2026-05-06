import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EventType, EventsPayloads } from '../../common/events';
import { AssetClass, Currency, LedgerEntryType } from '../../common/enums';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  ALLOCATION_GOLD_BPS,
  ALLOCATION_HIGH_RISK_BPS,
  ALLOCATION_INDEX_FUND_BPS,
} from '../../common/constants/allocation.constant';
import { TOTAL_BPS } from '../../common/constants/bps.constant';
import {
  I_EXCHANGE_PROVIDER,
  type IExchangeProvider,
} from '../../common/interfaces/exchange-provider.interface';

interface AllocationSlice {
  asset: AssetClass;
  bps: number;
}

const ALLOCATION: AllocationSlice[] = [
  { asset: AssetClass.GOLD, bps: ALLOCATION_GOLD_BPS },
  { asset: AssetClass.INDEX_FUND, bps: ALLOCATION_INDEX_FUND_BPS },
  { asset: AssetClass.HIGH_RISK, bps: ALLOCATION_HIGH_RISK_BPS },
];

/**
 * Listens for FUNDS_READY_FOR_INVESTMENT and splits the net cash across the
 * configured asset allocation. For each slice it:
 *   1. Calls the external exchange to buy units.
 *   2. Decrements wallet.fiatBalance and upserts the WalletPosition (OCC).
 *   3. Posts an INVESTMENT_ALLOCATION ledger entry.
 *   4. Emits TRADE_ORDER_EXECUTED so realtime/SSE pushes the update.
 *
 * Allocation is intentionally fixed (24/75/1) — risk-profile-driven splits
 * can be layered on later by reading user.riskProfile.
 */
@Injectable()
export class InvestmentAllocationService {
  private readonly logger = new Logger(InvestmentAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(I_EXCHANGE_PROVIDER)
    private readonly exchange: IExchangeProvider,
  ) {}

  @OnEvent(EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT)
  async onFundsReady(
    payload: EventsPayloads.FundsReadyForInvestmentEventPayload,
  ): Promise<void> {
    const {
      userId,
      walletId,
      transactionId,
      transactionEventId,
      idempotencyKey,
    } = payload;

    // Read the live wallet balance — leftover cash from prior sweeps that
    // couldn't reach a whole-unit threshold gets a chance to be invested now.
    const wallet = await this.prisma.digitalWallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) {
      this.logger.warn(`Wallet ${walletId} not found`);
      return;
    }

    const cashAvailable = wallet.fiatBalance;
    if (cashAvailable <= 0n) {
      this.logger.log(`No cash available for investment in wallet ${walletId}`);
      return;
    }

    this.logger.log(
      `Allocating ${cashAvailable} piasters across ${ALLOCATION.length} assets for user ${userId}`,
    );

    // Compute proportional budgets per slice.
    const sliceBudgets = this.splitAmount(cashAvailable);

    for (let i = 0; i < ALLOCATION.length; i++) {
      const slice = ALLOCATION[i];
      const budget = sliceBudgets[i];
      if (budget <= 0n) continue;

      // Whole-unit constraint: only spend if the slice's budget can buy
      // at least one full unit at the current price. Anything less stays
      // in fiat for the next sweep.
      let unitPrice: bigint;
      try {
        const priceMoney = await this.exchange.getLatestPrice(slice.asset);
        unitPrice = priceMoney.amount;
      } catch (err) {
        this.logger.error(
          `Failed to fetch price for ${slice.asset}: ${String(err)}`,
        );
        continue;
      }

      if (unitPrice <= 0n) continue;

      const wholeUnits = budget / unitPrice; // BigInt floor division
      if (wholeUnits === 0n) {
        this.logger.log(
          `Skipping ${slice.asset}: budget ${budget} < unit price ${unitPrice}`,
        );
        continue;
      }

      const spendAmount = wholeUnits * unitPrice;
      const portionMoney = Money.fromMinorUnit(spendAmount, Currency.EGP);
      const sliceIdempotencyKey = `invest-${idempotencyKey}-${slice.asset}`;

      try {
        const tradeResult = await this.exchange.buyAsset({
          userId,
          assetClass: slice.asset,
          units: 0n, // exchange computes units from totalCost
          totalCost: portionMoney,
          idempotencyKey: sliceIdempotencyKey,
        });

        if (
          !tradeResult.success ||
          tradeResult.executedUnits === undefined ||
          tradeResult.executionPrice === undefined
        ) {
          this.logger.error(
            `Buy failed for ${slice.asset}: ${tradeResult.message ?? 'unknown error'}`,
          );
          continue;
        }

        await this.persistTrade({
          userId,
          walletId,
          transactionEventId,
          asset: slice.asset,
          executedUnits: tradeResult.executedUnits,
          executionPrice: tradeResult.executionPrice,
          totalCost: portionMoney,
          idempotencyKey: sliceIdempotencyKey,
        });

        const tradePayload: EventsPayloads.TradeOrderExecutedEventPayload = {
          timestamp: new Date(),
          userId,
          transactionId,
          orderId: tradeResult.transactionId ?? sliceIdempotencyKey,
          idempotencyKey: sliceIdempotencyKey,
          asset: slice.asset,
          assetPrice: tradeResult.executionPrice,
          orderQuantity: tradeResult.executedUnits,
        };
        this.events.emit(
          EventType.SystemEventType.TRADE_ORDER_EXECUTED,
          tradePayload,
        );
      } catch (err) {
        this.logger.error(
          `Allocation slice ${slice.asset} failed: ${String(err)}`,
        );
      }
    }

    // Once all slices are placed, signal the FE via the wallet channel so the
    // dashboard refetches positions + recent ledger entries.
    const reconciledWallet = await this.prisma.digitalWallet.findUnique({
      where: { id: walletId },
    });
    if (reconciledWallet) {
      const reconciledMoney = Money.fromMinorUnit(
        reconciledWallet.fiatBalance,
        Currency.EGP,
      );
      const reconcilePayload: EventsPayloads.WalletBalanceReconciledEventPayload =
        {
          timestamp: new Date(),
          userId,
          transactionId,
          money: reconciledMoney,
        };
      this.events.emit(
        EventType.SystemEventType.WALLET_BALANCE_RECONCILED,
        reconcilePayload,
      );
    }
  }

  /**
   * Atomic write: decrement fiat balance (OCC), upsert position with weighted
   * average buy price, and post the INVESTMENT_ALLOCATION ledger entry.
   */
  private async persistTrade(args: {
    userId: string;
    walletId: string;
    transactionEventId?: string;
    asset: AssetClass;
    executedUnits: bigint;
    executionPrice: Money;
    totalCost: Money;
    idempotencyKey: string;
  }): Promise<void> {
    const {
      userId,
      walletId,
      transactionEventId,
      asset,
      executedUnits,
      executionPrice,
      totalCost,
      idempotencyKey,
    } = args;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const wallet = await tx.digitalWallet.findUniqueOrThrow({
            where: { id: walletId },
          });

          // 1. Decrement fiat balance with OCC
          const update = await tx.digitalWallet.updateMany({
            where: { id: walletId, version: wallet.version },
            data: {
              fiatBalance: { decrement: totalCost.amount },
              version: { increment: 1 },
            },
          });
          if (update.count === 0) {
            throw new Error('Concurrency conflict: wallet version mismatch');
          }

          // 2. Upsert position with weighted average buy price
          const existing = await tx.walletPosition.findUnique({
            where: { walletId_assetClass: { walletId, assetClass: asset } },
          });

          const newTotalUnits = (existing?.totalUnits ?? 0n) + executedUnits;
          const newAvgBuyPrice =
            newTotalUnits === 0n
              ? 0n
              : ((existing?.totalUnits ?? 0n) *
                  (existing?.averageBuyPrice ?? 0n) +
                  executedUnits * executionPrice.amount) /
                newTotalUnits;

          await tx.walletPosition.upsert({
            where: { walletId_assetClass: { walletId, assetClass: asset } },
            update: {
              totalUnits: newTotalUnits,
              averageBuyPrice: newAvgBuyPrice,
            },
            create: {
              walletId,
              assetClass: asset,
              totalUnits: newTotalUnits,
              averageBuyPrice: newAvgBuyPrice,
            },
          });

          // 3. Ledger entry for the audit trail
          await tx.ledgerEntry.create({
            data: {
              userId,
              walletId,
              type: LedgerEntryType.INVESTMENT_ALLOCATION,
              amount: totalCost.amount,
              currency: totalCost.currency,
              transactionEventId,
              idempotencyKey,
              note: `Bought ${executedUnits} ${asset} @ ${executionPrice.amount}`,
            },
          });
        },
        {
          // Neon's pooler can be slow to acquire a fresh connection on cold starts.
          maxWait: 15_000,
          timeout: 20_000,
        },
      );
    } catch (err) {
      if (this.isDuplicateIdempotencyKey(err)) {
        this.logger.warn(
          `INVESTMENT_ALLOCATION already posted for ${idempotencyKey}, skipping.`,
        );
        return;
      }
      throw err;
    }
  }

  private splitAmount(total: bigint): bigint[] {
    const totalBps = BigInt(TOTAL_BPS);
    const slices = ALLOCATION.map((a) => (total * BigInt(a.bps)) / totalBps);
    const distributed = slices.reduce((sum, s) => sum + s, 0n);
    const remainder = total - distributed;
    // Push the remainder onto the largest slice to avoid losing value.
    const largestIdx = ALLOCATION.reduce(
      (best, a, i, arr) => (a.bps > arr[best].bps ? i : best),
      0,
    );
    slices[largestIdx] += remainder;
    return slices;
  }

  private isDuplicateIdempotencyKey(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as Prisma.PrismaClientKnownRequestError).code === 'P2002'
    );
  }
}
