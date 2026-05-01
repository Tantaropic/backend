import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  I_BANK_PROVIDER,
  type IBankProvider,
} from '../../common/interfaces/bank-provider.interface';
import { Money } from '../../common/domain/value-objects/money.vo';
import { LedgerEntryType } from '../../common/enums';
import {
  EventType,
  EventsPayloads,
} from '../../common/events';
import { TransactionEventRepository } from '../transaction/transaction-event.repository';
import { LedgerRepository } from '../ledger/ledger.repository';
import { calculateRoundUp } from './roundup.calculator';

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

  constructor(
    @Inject(I_BANK_PROVIDER)
    private readonly bankProvider: IBankProvider,
    private readonly transactionEventRepo: TransactionEventRepository,
    private readonly ledgerRepo: LedgerRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handles each incoming bank transaction webhook event.
   *
   * Flow:
   * 1. Calculate round-up amount (next multiple of 5, always > 0)
   * 2. Collect funds via IBankProvider.debit()
   * 3. Write ROUNDUP ledger entry
   * 4. Mark TransactionEvent as processed
   * 5. Emit WALLET_FUNDS_ROUNDUP for the Fee Engine
   */
  @OnEvent(EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED)
  async handleTransaction(
    payload: EventsPayloads.TransactionWebhookReceivedEventPayload,
  ): Promise<void> {
    const {
      userId,
      transactionId,
      transactionEventId,
      money,
      merchantTag,
      idempotencyKey,
    } = payload;

    this.logger.log(`Processing round-up for txn ${transactionId}`);

    // ─── 1. Calculate round-up ───
    const roundUpAmount = calculateRoundUp(money.amount, money.currency);
    const roundUpMoney = Money.fromSmallestUnit(roundUpAmount, money.currency);
    const debitIdempotencyKey = `roundup-${idempotencyKey ?? transactionId}`;

    this.logger.log(
      `Round-up calculated: ${roundUpAmount} piasters for txn ${transactionId}`,
    );

    // ─── 2. Collect funds from user's bank ───
    const debitResult = await this.bankProvider.debit({
      userId,
      money: roundUpMoney,
      idempotencyKey: debitIdempotencyKey,
      metadata: {
        source: 'roundup-engine',
        originalTransactionId: transactionId,
      },
    });

    if (!debitResult.success) {
      this.logger.error(
        `Fund collection failed for txn ${transactionId}: ${debitResult.message}`,
      );
      throw new Error(`Round-up collection failed: ${debitResult.message}`);
    }

    // ─── 3. Write ROUNDUP ledger entry ───
    await this.ledgerRepo.saveEntry(
      {
        userId,
        type: LedgerEntryType.ROUNDUP,
        transactionEventId,
        idempotencyKey: `ledger-roundup-${idempotencyKey ?? transactionId}`,
        note: `Round-up from ${merchantTag ?? 'unknown'} transaction`,
      },
      roundUpMoney,
    );

    // ─── 4. Mark TransactionEvent as processed ───
    await this.transactionEventRepo.markProcessed(
      transactionEventId,
      roundUpAmount,
    );

    // ─── 5. Emit for Fee Engine ───
    const roundUpEvent: EventsPayloads.RoundUpCompletedEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId,
      transactionEventId,
      grossRoundUpAmount: roundUpMoney,
      merchantTag,
      idempotencyKey: debitIdempotencyKey,
    };

    this.eventEmitter.emit(
      EventType.SystemEventType.WALLET_FUNDS_ROUNDUP,
      roundUpEvent,
    );

    this.logger.log(
      `Round-up complete: ${roundUpAmount} piasters collected for txn ${transactionId}`,
    );
  }
}
