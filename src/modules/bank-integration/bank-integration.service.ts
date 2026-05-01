import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionEventRepository } from '../transaction/transaction-event.repository';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  type IFundTransferRequest,
  type IFundTransferResult,
  type IBankProvider,
  type ISimulateTransactionRequestDto,
  type ISimulateTransactionResponseDto,
} from '../../common/interfaces/bank-provider.interface';
import { HttpClientService } from '../../common/http';
import { StringifiedJSON, serialize } from '../../common/helpers/json-helper';
import {
  DebitRequestDto,
  DebitResponseDto,
  DepositRequestDto,
  DepositResponseDto,
  SimulateTransactionRequestDto,
  SimulateTransactionResponseDto,
  type TransactionWebhookRequestDto,
  type TransactionWebhookResponseDto,
} from './external-dtos';
import { EventType, EventsPayloads } from '../../common/events';
import { EventEmitter2 } from '@nestjs/event-emitter';
/**
 * Adapter implementation for the Bank Provider port.
 * Translates our internal domain types into external-facing DTOs for the Mock Bank API.
 * strictly enforces the Anti-Corruption Layer (ACL).
 */
@Injectable()
export class BankIntegrationService implements IBankProvider {
  private readonly logger = new Logger(BankIntegrationService.name);
  private readonly bankSimulateTransactionUrl: string;
  private readonly bankDebitUrl: string;
  private readonly bankDepositUrl: string;

  constructor(
    private readonly http: HttpClientService,
    private readonly config: ConfigService,
    private readonly eventService: EventEmitter2,
    private readonly transactionEventRepo: TransactionEventRepository,
  ) {
    const baseUrl = this.config.get<string>(
      'BASE_URL',
      'http://localhost:5001/api/v1',
    );

    this.bankSimulateTransactionUrl = `${baseUrl}/${this.config.get<string>(
      'MOCK_BANK_SIMULATE_TRANSACTION',
      'mock-bank/simulate-transaction',
    )}`;
    this.bankDebitUrl = `${baseUrl}/${this.config.get<string>(
      'MOCK_BANK_DEBIT_ROUTE',
      'mock-bank/debits',
    )}`;
    this.bankDepositUrl = `${baseUrl}/${this.config.get<string>(
      'MOCK_BANK_DEPOSIT_ROUTE',
      'mock-bank/deposits',
    )}`;
  }

  async simulateTransaction(
    request: ISimulateTransactionRequestDto,
  ): Promise<ISimulateTransactionResponseDto> {
    this.logger.log(
      `Simulating external transaction for user ${request.userId}`,
    );

    const externalPayload: SimulateTransactionRequestDto = {
      userId: request.userId,
      ...request.money.toPrimitives(),
      merchantTag: request.merchantTag,
      idempotencyKey: request.idempotencyKey,
    };

    const payloadStringified =
      serialize<SimulateTransactionRequestDto>(externalPayload);

    try {
      const response = await this.http.post<
        StringifiedJSON<SimulateTransactionRequestDto>,
        SimulateTransactionResponseDto
      >(this.bankSimulateTransactionUrl, payloadStringified);

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(
        `External transaction simulation failed for user ${request.userId}`,
      );
      throw error;
    }
  }

  async handleTransactionWebhook(
    payload: TransactionWebhookRequestDto,
  ): Promise<TransactionWebhookResponseDto> {
    this.logger.log(`Handling transaction webhook for user ${payload.userId}`);

    // Idempotency: skip if this transactionId was already processed
    const existing = await this.transactionEventRepo.findByTransactionId(
      payload.transactionId,
    );
    if (existing) {
      this.logger.log(
        `Duplicate webhook ignored for txn ${payload.transactionId}`,
      );
      return { success: true, transactionId: payload.transactionId };
    }

    // Convert to domain Money VO at the ACL boundary
    const money = Money.fromMinorUnit(payload.amount, payload.currency);

    // Persist the raw transaction event before emitting
    const txEvent = await this.transactionEventRepo.saveFromWebhook({
      userId: payload.userId,
      transactionId: payload.transactionId,
      merchantTag: payload.merchantTag,
      amount: payload.amount,
      currency: payload.currency,
      occurredAt: new Date(payload.occurredAt),
      rawPayload: payload,
    });

    // Emit domain event for downstream engines (Round-Up, etc.)
    const eventPayload: EventsPayloads.TransactionWebhookReceivedEventPayload =
      {
        timestamp: new Date(),
        userId: payload.userId,
        transactionId: payload.transactionId,
        transactionEventId: txEvent.id,
        money,
        merchantTag: payload.merchantTag,
        occurredAt: new Date(payload.occurredAt),
      };

    this.eventService.emit(
      EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED,
      eventPayload,
    );

    return {
      success: true,
      transactionId: payload.transactionId,
    };
  }

  /**
   * Translates internal FundTransferRequest into a DebitRequestDto for the external API.
   */
  async debit(payload: IFundTransferRequest): Promise<IFundTransferResult> {
    this.logger.log(`Initiating external DEBIT for user ${payload.userId}`);

    const externalPayload: DebitRequestDto = {
      userId: payload.userId,
      ...payload.money.toPrimitives(),
      idempotencyKey: payload.idempotencyKey,
      metadata: payload.metadata,
    };

    const payloadStringified = serialize<DebitRequestDto>(externalPayload);

    try {
      // Execute external HTTP call via the ACL boundary
      const response = await this.http.post<
        StringifiedJSON<DebitRequestDto>,
        DebitResponseDto
      >(this.bankDebitUrl, payloadStringified);

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(`External DEBIT failed for user ${payload.userId}`);
      throw error;
    }
  }

  /**
   * Translates internal FundTransferRequest into a DepositRequestDto for the external API.
   */
  async deposit(payload: IFundTransferRequest): Promise<IFundTransferResult> {
    this.logger.log(`Initiating external DEPOSIT for user ${payload.userId}`);

    const externalPayload: DepositRequestDto = {
      userId: payload.userId,
      ...payload.money.toPrimitives(),
      idempotencyKey: payload.idempotencyKey,
      metadata: payload.metadata,
    };

    const payloadStringified = serialize<DepositRequestDto>(externalPayload);

    try {
      // Execute external HTTP call via the ACL boundary
      const response = await this.http.post<
        StringifiedJSON<DepositRequestDto>,
        DepositResponseDto
      >(this.bankDepositUrl, payloadStringified);

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(`External DEPOSIT failed for user ${payload.userId}`);
      throw error;
    }
  }

  /**
   * Private helper to map external API responses back to our internal FundTransferResult.
   */
  private mapResponse(
    external: DebitResponseDto | DepositResponseDto,
  ): IFundTransferResult {
    return {
      success: external.success,
      message: external.message,
      transactionId: external.transactionId,
      userId: external.userId,
      money:
        external.amount !== undefined && external.currency !== undefined
          ? Money.fromMinorUnit(external.amount, external.currency)
          : undefined,
    };
  }
}
