import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FeeCalculatorService } from './fee.calculator.service';
import { EventType, EventsPayloads } from '../../common/events';
import { LedgerEntryType, AssetClass, Currency } from '../../common/enums';
import { Money } from '../../common/domain/value-objects/money.vo';

@Injectable()
export class FeeEngineService {
  private readonly logger = new Logger(FeeEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: FeeCalculatorService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Deposit path: cash has already been credited (gross) to the user's wallet by the
   * Bank Integration. We carve off FUND_FEE, then signal the Asset Allocator with the net.
   */
  @OnEvent(EventType.SystemEventType.ROUNDUP_DEBITED)
  async onRoundupDebited(
    payload: EventsPayloads.RoundupDebitedEventPayload,
  ): Promise<void> {
    const {
      userId,
      walletId,
      transactionEventId,
      grossAmount,
      idempotencyKey,
    } = payload;
    const feeIdempotencyKey = `fund-fee:${idempotencyKey}`;

    // Load profile (for AUM bracket) + wallet (for OCC version).
    const wallet = await this.prisma.digitalWallet.findUniqueOrThrow({
      where: { id: walletId },
      include: { profile: true },
    });

    // Pure calculation.
    const { bps, fee, net } = this.calculator.calculateFundFee(
      grossAmount,
      wallet.profile.aum,
    );

    // Atomic write: deduct fee from wallet (OCC), bump AUM by net, post ledger entry.
    try {
      await this.prisma.$transaction(async (tx) => {
        const walletUpdate = await tx.digitalWallet.updateMany({
          where: { id: walletId, version: wallet.version },
          data: {
            fiatBalance: { decrement: fee.amount },
            version: { increment: 1 },
          },
        });
        if (walletUpdate.count === 0) {
          throw new Error('Concurrency conflict: wallet version mismatch');
        }

        const profileUpdate = await tx.profile.updateMany({
          where: { id: wallet.profileId, version: wallet.profile.version },
          data: {
            aum: { increment: net.amount },
            version: { increment: 1 },
          },
        });
        if (profileUpdate.count === 0) {
          throw new Error('Concurrency conflict: profile version mismatch');
        }

        await tx.ledgerEntry.create({
          data: {
            userId,
            walletId,
            type: LedgerEntryType.FUND_FEE,
            amount: fee.amount,
            currency: fee.currency,
            transactionEventId,
            idempotencyKey: feeIdempotencyKey,
            note: `FUND_FEE ${bps}bps on gross ${grossAmount.amount}`,
          },
        });
      });
    } catch (err) {
      // Unique-constraint hit on idempotencyKey = event replay; swallow & continue.
      if (this.isDuplicateIdempotencyKey(err)) {
        this.logger.warn(
          `FUND_FEE already posted for ${feeIdempotencyKey}, skipping.`,
        );
      } else {
        throw err;
      }
    }

    // Hand off to the Asset Allocator.
    const nextPayload: EventsPayloads.FundsReadyForInvestmentEventPayload = {
      userId,
      walletId,
      transactionEventId,
      transactionId: payload.transactionId,
      netAmount: net,
      idempotencyKey,
      timestamp: new Date(),
    };
    this.events.emit(
      EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT,
      nextPayload,
    );
  }

  private isDuplicateIdempotencyKey(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    );
  }

  /**
   * Withdrawal path: the Withdrawal Service has decided which units to sell per asset.
   * We compute realized profit (WAC) per asset, sum the tiered PROFIT_FEE, decrement
   * positions/AUM under OCC, post one PROFIT_FEE ledger row, then emit
   * WITHDRAWAL_FEE_APPLIED so the Withdrawal Service can finalize the bank transfer.
   */
  @OnEvent(EventType.SystemEventType.WITHDRAWAL_REQUESTED)
  async onWithdrawalRequested(
    payload: EventsPayloads.WithdrawalRequestedEventPayload,
  ): Promise<void> {
    const { userId, walletId, idempotencyKey, sales } = payload;
    const feeIdempotencyKey = `profit-fee:${idempotencyKey}`;

    if (sales.length === 0) {
      throw new Error('WITHDRAWAL_REQUESTED carried no sales');
    }
    const currency: Currency = sales[0].executionPrice.currency;

    // Load wallet (for profileId + OCC version on profile) and all touched positions.
    const wallet = await this.prisma.digitalWallet.findUniqueOrThrow({
      where: { id: walletId },
      include: { profile: true },
    });

    const assetClasses = sales.map((s) => s.assetClass);
    const positions = await this.prisma.walletPosition.findMany({
      where: { walletId, assetClass: { in: assetClasses } },
    });
    const positionByAsset = new Map<AssetClass, (typeof positions)[number]>(
      positions.map((p) => [p.assetClass, p]),
    );

    // Per-sale: realized profit + tiered fee. Aggregate totals.
    let proceedsTotal = Money.fromSmallestUnit(0n, currency);
    let costOfSoldTotal = Money.fromSmallestUnit(0n, currency);
    let realizedProfitTotal = Money.fromSmallestUnit(0n, currency);
    let profitFeeTotal = Money.fromSmallestUnit(0n, currency);

    for (const sale of sales) {
      const position = positionByAsset.get(sale.assetClass);
      if (!position) {
        throw new Error(`Missing wallet position for asset ${sale.assetClass}`);
      }
      if (position.totalUnits < sale.units) {
        throw new Error(
          `Insufficient units for ${sale.assetClass}: have ${position.totalUnits}, need ${sale.units}`,
        );
      }

      const { proceeds, costOfSold, realizedProfit } =
        this.calculator.calculateRealizedProfit({
          units: sale.units,
          executionPrice: sale.executionPrice,
          averageBuyPrice: position.averageBuyPrice,
        });
      const { fee } = this.calculator.calculateProfitFee(realizedProfit);

      proceedsTotal = proceedsTotal.add(proceeds);
      costOfSoldTotal = costOfSoldTotal.add(costOfSold);
      realizedProfitTotal = realizedProfitTotal.add(realizedProfit);
      profitFeeTotal = profitFeeTotal.add(fee);
    }

    const netToUser = proceedsTotal.subtract(profitFeeTotal);

    // Atomic: OCC-decrement positions, decrement AUM by principal, post PROFIT_FEE row.
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const sale of sales) {
          const position = positionByAsset.get(sale.assetClass)!;
          const positionUpdate = await tx.walletPosition.updateMany({
            where: { id: position.id, version: position.version },
            data: {
              totalUnits: { decrement: sale.units },
              version: { increment: 1 },
            },
          });
          if (positionUpdate.count === 0) {
            throw new Error(
              `Concurrency conflict: position version mismatch for ${sale.assetClass}`,
            );
          }
        }

        const profileUpdate = await tx.profile.updateMany({
          where: { id: wallet.profileId, version: wallet.profile.version },
          data: {
            aum: { decrement: costOfSoldTotal.amount },
            version: { increment: 1 },
          },
        });
        if (profileUpdate.count === 0) {
          throw new Error('Concurrency conflict: profile version mismatch');
        }

        await tx.ledgerEntry.create({
          data: {
            userId,
            walletId,
            type: LedgerEntryType.PROFIT_FEE,
            amount: profitFeeTotal.amount,
            currency: profitFeeTotal.currency,
            idempotencyKey: feeIdempotencyKey,
            note: `PROFIT_FEE on realized profit ${realizedProfitTotal.amount}`,
          },
        });
      });
    } catch (err) {
      if (this.isDuplicateIdempotencyKey(err)) {
        this.logger.warn(
          `PROFIT_FEE already posted for ${feeIdempotencyKey}, skipping.`,
        );
      } else {
        throw err;
      }
    }

    const nextPayload: EventsPayloads.WithdrawalFeeAppliedEventPayload = {
      userId,
      walletId,
      withdrawalRequestId: payload.withdrawalRequestId,
      transactionId: payload.transactionId,
      realizedProfit: realizedProfitTotal,
      profitFee: profitFeeTotal,
      netToUser,
      timestamp: new Date(),
    };
    this.events.emit(
      EventType.SystemEventType.WITHDRAWAL_FEE_APPLIED,
      nextPayload,
    );
  }
}
