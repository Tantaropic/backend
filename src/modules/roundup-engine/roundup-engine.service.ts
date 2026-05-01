import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  I_BANK_PROVIDER,
  type IBankProvider,
  type IFundTransferResult,
} from '../../common/interfaces/bank-provider.interface';
import { LedgerEntryType } from '../../common/enums';
import { EventType, EventsPayloads } from '../../common/events';
import { TransactionEventRepository } from '../transaction/transaction-event.repository';
import { LedgerRepository } from '../ledger/ledger.repository';
import { UserRepository } from '../users/user.repository';
import { calculateRoundUp } from './roundup.calculator';
import { Money } from '../../common/domain/value-objects/money.vo';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WalletRepository } from '../wallet/wallet.repository';

/**
 * Round-Up Engine — listens for incoming bank transaction events,
 * calculates the spare change round-up, collects funds from the user's bank,
 * records the movement in the ledger, and emits an event for downstream engines.
 *
 * Interactions:
 *   Input:  BANK_TRANSACTION_WEBHOOK_RECEIVED event (from BankIntegrationService)
 *   Output: WALLET_FUNDS_ROUNDUP event (consumed by Fee Engine)
 *   Deps:   IBankProvider (debit), TransactionEventRepository, LedgerRepository
 */
@Injectable()
export class RoundUpEngineService {
  private readonly logger = new Logger(RoundUpEngineService.name);
  private readonly transactionWebHookIdempotencyMap: Set<string> = new Set();

  constructor(
    @Inject(I_BANK_PROVIDER)
    private readonly bankProvider: IBankProvider,
    private readonly transactionEventRepo: TransactionEventRepository,
    private readonly ledgerRepo: LedgerRepository,
    private readonly userRepository: UserRepository,
    private readonly walletRepository: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handles each incoming bank transaction webhook event.
   *
   * Flow:
   * 1. Calculate round-up amount (next multiple of 5, always > 0)
   * 2. Collect funds via IBankProvider.debit()
   * 3. Write ROUNDUP ledger entry & Update Wallet Balance + Position + Version
   * 5. Mark TransactionEvent as processed
   * 6. Emit WALLET_FUNDS_ROUNDUP for the Fee Engine
   */
  @OnEvent(EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED)
  async handleTransaction(
    payload: EventsPayloads.TransactionWebhookReceivedEventPayload,
  ): Promise<void> {
    console.log(payload);
    const {
      userId,
      transactionId,
      transactionEventId,
      money,
      merchantTag,
      idempotencyKey,
    } = payload;

    const transactionWebHookIdempotencyKey = idempotencyKey;

    // ─── 0. Check idempotency key & validate user ───
    if (transactionWebHookIdempotencyKey) {
      if (
        this.transactionWebHookIdempotencyMap.has(
          transactionWebHookIdempotencyKey,
        )
      ) {
        this.logger.log(
          `Transaction webhook idempotency key already exists for txn ${transactionWebHookIdempotencyKey}`,
        );
        return;
      }

      this.transactionWebHookIdempotencyMap.add(
        transactionWebHookIdempotencyKey,
      );
    }

    this.logger.log(
      `Processing round-up for txn ${transactionWebHookIdempotencyKey}`,
    );

    const user = await this.userRepository.findByIdWithProfileAndWallet(userId);
    if (!user || !user.profile.wallet) {
      this.logger.error(`User or Wallet for ${userId} not found`);
      return;
    }

    const wallet = user.profile.wallet;

    // ─── 1. Calculate round-up ───
    const roundUpMoney = calculateRoundUp(money, user.roundUpStep);

    this.logger.log(
      `Round-up calculated: ${roundUpMoney.amount} piasters for txn ${transactionId}`,
    );

    // ─── 2. Collect funds from user's bank ───
    const debitResult = await this.debitUser(
      userId,
      roundUpMoney,
      transactionId,
    );

    if (!debitResult || !debitResult.success) {
      this.logger.error(
        `Fund roundup collection failed for txn ${transactionId}`,
      );
      throw new Error(`Round-up collection failed`);
    }

    // ─── 3. Atomic Updates: Ledger + TransactionEvent + Wallet Balance (OCC) ───
    await this.prisma.$transaction(async (tx) => {
      // 3.1. Write ROUNDUP ledger entry
      await this.ledgerRepo.saveEntry(
        {
          userId,
          walletId: wallet.id,
          type: LedgerEntryType.ROUNDUP,
          transactionEventId,
          idempotencyKey: debitResult.idempotencyKey,
          note: `Round-up from ${merchantTag ?? 'unknown'} transaction`,
        },
        roundUpMoney,
        tx,
      );

      // 3.2. Mark TransactionEvent as processed
      await this.transactionEventRepo.markProcessed(
        transactionEventId,
        roundUpMoney.toMinorUnit().amount,
      );

      // 3.3. Update Wallet Balance with OCC
      await this.walletRepository.incrementFiatBalance(
        wallet.id,
        roundUpMoney.toMinorUnit().amount,
        wallet.version,
      );
    });

    // ─── 5. Emit for Fee Engine ───
    const roundUpEvent: EventsPayloads.RoundUpCompletedEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId,
      transactionEventId,
      grossRoundUpAmount: roundUpMoney,
      merchantTag,
      idempotencyKey: debitResult.idempotencyKey,
    };

    this.eventEmitter.emit(
      EventType.SystemEventType.WALLET_FUNDS_ROUNDUP,
      roundUpEvent,
    );

    this.logger.log(
      `Round-up complete: ${roundUpMoney.toMinorUnit().amount} piasters collected for txn ${transactionId}`,
    );
  }

  private async debitUser(
    userId: string,
    amount: Money,
    transactionId?: string,
  ): Promise<IFundTransferResult & { idempotencyKey: string }> {
    const idempotencyKey = this.getRoundupIdempotencyKey(transactionId);
    const debitResult = await this.bankProvider.debit({
      userId,
      money: amount,
      idempotencyKey,
      metadata: {
        source: 'roundup-engine',
        originalTransactionId: transactionId,
      },
    });

    return { ...debitResult, idempotencyKey };
  }

  private getRoundupIdempotencyKey(transactionId?: string): string {
    return `roundup-${transactionId ?? crypto.randomUUID()}`;
  }
}
