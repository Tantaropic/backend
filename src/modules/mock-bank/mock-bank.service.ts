import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { MERCHANT_TAGS } from './constants';
import {
  SimulateTransactionDto,
  CollectFundsDto,
  DepositFundsDto,
  BankTransactionResponseDto,
  BankOperationResponseDto,
} from './dtos';

/**
 * Simulates an external bank API.
 * Generates mock transactions, handles fund collection, and deposit-back operations.
 * Uses HTTP to call the system's webhook endpoint, simulating a real bank integration.
 */
@Injectable()
export class MockBankService {
  private readonly logger = new Logger(MockBankService.name);
  private readonly idempotencyStore = new Map<string, BankOperationResponseDto>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Simulates a purchase by generating a random transaction and posting it
   * to the system's webhook endpoint via HTTP.
   * @param dto - Optional userId, amount, and merchantTag overrides.
   * @returns The generated transaction details as the bank would return them.
   */
  async simulateTransaction(
    dto: SimulateTransactionDto,
  ): Promise<BankTransactionResponseDto> {
    const bankTransactionId = randomUUID();
    const merchantTag =
      dto.merchantTag ?? MERCHANT_TAGS[Math.floor(Math.random() * MERCHANT_TAGS.length)];
    const amount = dto.amount ?? parseFloat((Math.random() * 499 + 1).toFixed(2));
    const occurredAt = new Date().toISOString();

    const webhookPayload = {
      bankTransactionId,
      userId: dto.userId,
      merchantTag,
      amount,
      currency: 'EGP',
      occurredAt,
    };

    const port = this.configService.get<number>('PORT', 5001);

    let webhookDelivered = true;

    try {
      await firstValueFrom(
        this.httpService.post(
          `http://localhost:${port}/webhook/transaction`,
          webhookPayload,
        ),
      );
      this.logger.log(
        `Transaction simulated: ${bankTransactionId} | ${merchantTag} | ${amount} EGP`,
      );
    } catch (error) {
      webhookDelivered = false;
      this.logger.warn(
        `Webhook delivery failed for ${bankTransactionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return {
      success: true,
      bankTransactionId,
      merchantTag,
      amount,
      currency: 'EGP',
      occurredAt,
      webhookDelivered,
    };
  }

  /**
   * Simulates collecting round-up funds from the user's bank account.
   * Called by the Sweep Engine after calculating the round-up amount.
   * @param dto - Collection request with amount, bank transaction reference, and idempotency key.
   * @returns Operation confirmation.
   */
  collectFunds(dto: CollectFundsDto): BankOperationResponseDto {
    const existing = this.idempotencyStore.get(dto.idempotencyKey);
    if (existing) {
      this.logger.log(`Idempotent hit for collect: ${dto.idempotencyKey}`);
      return existing;
    }

    const response: BankOperationResponseDto = {
      success: true,
      operationId: randomUUID(),
      message: `Collected ${dto.amount} ${dto.currency} from user ${dto.userId}`,
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `Funds collected: ${dto.amount} ${dto.currency} for txn ${dto.bankTransactionId}`,
    );

    return response;
  }

  /**
   * Simulates depositing money back to the user's bank account during withdrawal.
   * Called by the Redemption Handler after liquidating assets.
   * @param dto - Deposit request with amount and idempotency key.
   * @returns Operation confirmation.
   */
  depositFunds(dto: DepositFundsDto): BankOperationResponseDto {
    const existing = this.idempotencyStore.get(dto.idempotencyKey);
    if (existing) {
      this.logger.log(`Idempotent hit for deposit: ${dto.idempotencyKey}`);
      return existing;
    }

    const response: BankOperationResponseDto = {
      success: true,
      operationId: randomUUID(),
      message: `Deposited ${dto.amount} ${dto.currency} to user ${dto.userId}'s bank`,
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `Funds deposited: ${dto.amount} ${dto.currency} to user ${dto.userId}`,
    );

    return response;
  }
}
