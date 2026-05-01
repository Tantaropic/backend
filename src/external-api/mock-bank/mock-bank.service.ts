import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';
import { Currency } from '@prisma/client';
import { HttpClientService } from '../../common/http';
import {
  MERCHANT_TAGS,
  type MerchantTag,
} from '../../common/interfaces/bank-provider.interface';
import {
  FundTransferRequestDto,
  FundTransferResponseDto,
  SimulateTransactionRequestDto,
  SimulateTransactionResponseDto,
  TransactionWebhookRequestDto,
  TransactionWebhookResponseDto,
} from './dto';

/**
 * Simulates an external bank API.
 * Generates mock transactions, handles fund collection, and deposit-back operations.
 * Uses HTTP to call the system's webhook endpoint, simulating a real bank integration.
 */
@Injectable()
export class MockBankService {
  private readonly baseUrl: string;
  private readonly transactionWebhookUrl: string;
  private readonly logger = new Logger(MockBankService.name);
  // For simplicity, using an in-memory map. In production, use Redis or a database.
  // This map stores the response for each idempotency key.
  private readonly debitIdempotencyStore = new Map<
    string,
    FundTransferResponseDto
  >();
  private readonly depositIdempotencyStore = new Map<
    string,
    FundTransferResponseDto
  >();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly httpClientService: HttpClientService,
  ) {
    const baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:5001/api/v1',
    );
    this.transactionWebhookUrl = `${baseUrl}/${this.configService.get<string>(
      'SYSTEM_TRANSACTION_WEBHOOK_ROUTE',
      'bank-integrations/transaction-webhook',
    )}`;
  }

  /**
   * Simulates a purchase by generating a random transaction and posting it
   * to the system's webhook endpoint via HTTP.
   * @param dto - Optional userId, amount, and merchantTag overrides.
   * @returns The generated transaction details as the bank would return them.
   */
  async simulateTransaction(
    dto: SimulateTransactionRequestDto,
  ): Promise<SimulateTransactionResponseDto> {
    const transactionWebhookPayload: TransactionWebhookRequestDto = {
      transactionId: randomUUID(),
      occurredAt: new Date().toISOString(),
      amount: dto.amount,
      currency: dto.currency,
      merchantTag: dto.merchantTag,
      userId: dto.userId,
      idempotencyKey: dto.idempotencyKey,
    };

    // try to send transaction webhook to the system
    const webhookDelivered = await this.sendTransactionWebhook(
      transactionWebhookPayload,
    );

    return {
      success: true,
      webhookDelivered,
      ...transactionWebhookPayload,
    };
  }

  /**
   * Simulate collect money operation.
   * @param accountId - User's bank account ID.
   * @param dto - Collection request with amount and idempotency key.
   * @returns {IFundTransferResult}
   */
  debit(debitDto: FundTransferRequestDto): FundTransferResponseDto {
    const existing = this.getDebitIdempotencyKey(debitDto.idempotencyKey);
    if (existing) {
      this.logger.log(`Idempotent hit for collect: ${debitDto.idempotencyKey}`);
      return existing;
    }

    const response: FundTransferResponseDto = {
      success: true,
      amount: debitDto.amount,
      currency: debitDto.currency,
      userId: debitDto.userId,
      transactionId: randomUUID(),
      message: `[from: MOCK BANK] Collected ${debitDto.amount} ${debitDto.currency} from user ${debitDto.userId}`,
    };

    this.setDebitIdempotencyKey(debitDto.idempotencyKey, response);
    this.logger.log(
      `[from: MOCK BANK] Funds collected: ${debitDto.amount} ${debitDto.currency} for txn ${response.transactionId}`,
    );

    return response;
  }

  /**
   * Simulate deposit money operation.
   * @param accountId - User's bank account ID.
   * @param dto - Deposit request with amount and idempotency key.
   * @returns {}
   */
  deposit(depositDto: FundTransferRequestDto): FundTransferResponseDto {
    const existing = this.getDepositIdempotencyKey(depositDto.idempotencyKey);
    if (existing) {
      this.logger.log(
        `Idempotent hit for deposit: ${depositDto.idempotencyKey}`,
      );
      return existing;
    }

    const response: FundTransferResponseDto = {
      success: true,
      amount: depositDto.amount,
      currency: depositDto.currency,
      userId: depositDto.userId,
      transactionId: randomUUID(),
      message: `Deposited ${depositDto.amount} ${depositDto.currency} to user ${depositDto.userId}'s bank`,
    };

    this.setDepositIdempotencyKey(depositDto.idempotencyKey, response);
    this.logger.log(
      `Funds deposited: ${depositDto.amount} ${depositDto.currency} for txn ${response.transactionId}`,
    );

    return response;
  }

  /**
   * Generate a random transaction if the input dto is empty.
   */
  fakeTransactionIfEmpty(
    dto: Partial<SimulateTransactionRequestDto>,
  ): SimulateTransactionRequestDto {
    return {
      userId: dto.userId ?? randomUUID(),
      amount:
        (dto.amount
          ? BigInt(Math.round(Number(dto.amount)))
          : BigInt(this.randomAmount())) * 100n,
      currency: dto.currency ?? Currency.EGP,
      merchantTag: dto.merchantTag ?? this.randomMerchanTag(),
      idempotencyKey: dto.idempotencyKey ?? randomUUID(),
    };
  }

  /**
   * Send transaction webhook to the system.
   */
  private async sendTransactionWebhook(
    payload: TransactionWebhookRequestDto,
  ): Promise<boolean> {
    let webhookDelivered = true;

    try {
      await this.httpClientService.post<
        TransactionWebhookRequestDto,
        TransactionWebhookResponseDto
      >(this.transactionWebhookUrl, payload);
      this.logger.log(
        `Transaction webhook sent: ${payload.transactionId} | ${payload.merchantTag} | ${payload.amount} ${payload.currency}`,
      );
    } catch (error) {
      webhookDelivered = false;
      this.logger.warn(
        `Webhook delivery failed for ${payload.transactionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return webhookDelivered;
  }

  /**
   * Returns a random amount between 1 and 500.
   */
  private randomAmount(): number {
    return Math.floor(Math.random() * 499 + 1);
  }

  /**
   * Returns a random merchant tag from the list of available merchant tags.
   */
  private randomMerchanTag(): MerchantTag {
    return MERCHANT_TAGS[Math.floor(Math.random() * MERCHANT_TAGS.length)];
  }

  /**
   * Store debit response.
   */
  private setDebitIdempotencyKey(key: string, data: FundTransferResponseDto) {
    this.debitIdempotencyStore.set(key, data);
  }

  /**
   * Store deposit response.
   */
  private setDepositIdempotencyKey(
    key: string,
    data: FundTransferResponseDto,
  ): void {
    this.depositIdempotencyStore.set(key, data);
  }

  /**
   * Get debit response.
   */
  private getDebitIdempotencyKey(
    key: string,
  ): FundTransferResponseDto | undefined {
    return this.debitIdempotencyStore.get(key);
  }

  /**
   * Get deposit response.
   */
  private getDepositIdempotencyKey(
    key: string,
  ): FundTransferResponseDto | undefined {
    return this.depositIdempotencyStore.get(key);
  }

  /**
   * Delete debit response.
   */
  private deleteDebitIdempotencyKey(key: string) {
    this.debitIdempotencyStore.delete(key);
  }

  /**
   * Delete deposit response.
   */
  private deleteDepositIdempotencyKey(key: string) {
    this.depositIdempotencyStore.delete(key);
  }
}
