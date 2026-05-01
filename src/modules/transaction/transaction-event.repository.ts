import { Injectable } from '@nestjs/common';
import { Currency } from '../../common/enums';
import { TransactionEvent } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface SaveTransactionEventData {
  userId: string;
  transactionId: string;
  merchantTag: string;
  amount: bigint;
  currency: Currency;
  occurredAt: Date;
  rawPayload?: any;
  idempotencyKey: string;
}

/**
 * Repository for persisting raw transaction events received from the external bank webhook.
 * Acts as the ACL for the TransactionEvent entity.
 */
@Injectable()
export class TransactionEventRepository extends BaseRepository<TransactionEvent> {
  constructor(prisma: PrismaService) {
    super(prisma, 'transactionEvent');
  }

  /**
   * Saves a new TransactionEvent from a webhook payload.
   * Uses transactionId as the natural idempotency key (@unique in schema).
   */
  async saveFromWebhook(
    data: SaveTransactionEventData,
  ): Promise<TransactionEvent> {
    return this.prisma.transactionEvent.create({
      data: {
        userId: data.userId,
        transactionId: data.transactionId,
        idempotencyKey: data.transactionId,
        merchantTag: data.merchantTag,
        amount: data.amount,
        currency: data.currency,
        occurredAt: data.occurredAt,
        rawPayload: data.rawPayload ?? undefined,
      },
    });
  }

  /**
   * Finds a TransactionEvent by its unique transactionId.
   * Used for idempotency checks — if a row exists, the webhook was already processed.
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<TransactionEvent | null> {
    return this.prisma.transactionEvent.findUnique({
      where: { transactionId },
    });
  }

  /**
   * Marks a TransactionEvent as processed by the Round-Up Engine.
   * Sets the calculated roundUpAmount and the processing timestamp.
   */
  async markProcessed(
    id: string,
    roundUpAmount: bigint,
  ): Promise<TransactionEvent> {
    return await this.prisma.transactionEvent.update({
      where: { id },
      data: {
        roundUpAmount,
        processedAt: new Date(),
      },
    });
  }
}
