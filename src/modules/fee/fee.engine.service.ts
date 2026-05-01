import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FeeCalculatorService } from './fee.calculator.service';
import { EventType, EventsPayloads } from '../../common/events';
import { LedgerEntryType } from '../../common/enums';

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
}
