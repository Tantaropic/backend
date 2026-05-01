import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { AiInsightsRepository } from './ai-insights.repository';
import { EventType } from '../../common/events';
import type {
  TransactionWebhookReceivedEventPayload,
  WalletBalanceReconciledEventPayload,
  AiInsightGeneratedEventPayload,
} from '../../common/events/event-payload';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LlmService } from '../../common/llm';
import type { AiInsight } from '@prisma/client';
import { NUDGE_WORTHY_TAGS, MILESTONES } from '../../common/constants';

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);

  constructor(
    private readonly repository: AiInsightsRepository,
    private readonly prisma: PrismaService,
    private readonly eventService: EventEmitter2,
    private readonly llm: LlmService,
  ) {}

  @OnEvent(EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED)
  async handleTransactionWebhook(
    payload: TransactionWebhookReceivedEventPayload,
  ): Promise<void> {
    const { userId, merchantTag, transactionId, money, idempotencyKey } =
      payload;

    if (!userId || !merchantTag) return;
    if (!NUDGE_WORTHY_TAGS.includes(merchantTag)) return;

    const insightKey = `ai-insight-${idempotencyKey ?? transactionId}`;

    this.logger.log(
      `Generating spending nudge for user ${userId} (tag: ${merchantTag})`,
    );

    try {
      const recentCount = await this.getRecentTagCount(userId, merchantTag);
      const amountDisplay = Number(money.toMajorUnit().amount);

      const message = await this.generateSpendingNudge(
        merchantTag,
        amountDisplay,
        recentCount,
      );

      const insight = await this.repository.saveInsight({
        userId,
        message,
        transactionEventId: transactionId,
        idempotencyKey: insightKey,
        triggerTag: merchantTag,
      });

      const eventPayload: AiInsightGeneratedEventPayload = {
        userId,
        insightId: insight.id,
        message,
      };
      this.eventService.emit(
        EventType.SystemEventType.AI_INSIGHT_GENERATED,
        eventPayload,
      );

      this.logger.log(`Insight saved for user ${userId}: ${insight.id}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate insight for user ${userId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(EventType.SystemEventType.WALLET_BALANCE_RECONCILED)
  async handleMilestoneCelebration(
    payload: WalletBalanceReconciledEventPayload,
  ): Promise<void> {
    const { userId, transactionId, money } = payload;
    if (!userId) return;

    const currentBalance = Number(money.toMajorUnit().amount);

    // Find the highest milestone the user just crossed (iterate from largest)
    let crossedMilestone: number | undefined;
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      if (currentBalance >= MILESTONES[i]) {
        crossedMilestone = MILESTONES[i];
        break;
      }
    }

    if (!crossedMilestone) return;

    // Idempotency: one celebration per milestone per user.
    // Check BEFORE calling the LLM to avoid wasted API calls on duplicates.
    const insightKey = `milestone-${userId}-${String(crossedMilestone)}`;
    const existing = await this.repository.findByIdempotencyKey(insightKey);
    if (existing) return;

    this.logger.log(
      `User ${userId} crossed ${String(crossedMilestone)} EGP milestone`,
    );

    try {
      const message = await this.generateMilestoneCelebration(
        crossedMilestone,
        currentBalance,
      );

      const insight = await this.repository.saveInsight({
        userId,
        message,
        transactionEventId: transactionId,
        idempotencyKey: insightKey,
        triggerTag: `milestone_${String(crossedMilestone)}`,
      });

      const eventPayload: AiInsightGeneratedEventPayload = {
        userId,
        insightId: insight.id,
        message,
      };
      this.eventService.emit(
        EventType.SystemEventType.AI_INSIGHT_GENERATED,
        eventPayload,
      );

      this.logger.log(
        `Milestone insight saved for user ${userId}: ${insight.id}`,
      );
    } catch (error: unknown) {
      // A duplicate-key violation on idempotencyKey means a concurrent event
      // already wrote this milestone — not a real failure, just skip it.
      if (this.isDuplicateKeyError(error)) {
        this.logger.log(
          `Milestone insight for ${userId}/${String(crossedMilestone)} already saved by concurrent event`,
        );
        return;
      }
      this.logger.error(
        `Failed to generate milestone insight for user ${userId}: ${String(error)}`,
      );
    }
  }
  async getUserInsights(userId: string): Promise<AiInsight[]> {
    return this.repository.findByUser(userId);
  }

  private async getRecentTagCount(
    userId: string,
    merchantTag: string,
  ): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.transactionEvent.count({
      where: {
        userId,
        merchantTag,
        occurredAt: { gte: thirtyDaysAgo },
      },
    });
  }

  private async generateSpendingNudge(
    merchantTag: string,
    amountSpent: number,
    recentCount: number,
  ): Promise<string> {
    const systemPrompt = `You are a friendly financial wellness advisor for Tantaropic, a Sharia-compliant micro-investment app.
Your job is to gently encourage users to invest instead of overspending.
Keep messages short (2-3 sentences max), warm, and motivational.
Never be judgmental or preachy. Focus on the opportunity cost — what that money could become if invested.
Use simple language. Do not use emojis.`;

    const userPrompt = `The user just spent ${String(amountSpent)} EGP at a "${merchantTag.replace(/_/g, ' ')}" merchant.
They have made ${String(recentCount)} similar purchases in the last 30 days.
Generate a brief, encouraging nudge about what this spending could become if invested instead.`;

    return this.llm.complete({
      systemPrompt,
      userPrompt,
      // 2–3 sentences ≈ ~80 tokens; 150 leaves ~1.5× headroom.
      maxTokens: 150,
      fallback: 'Keep investing, every piaster counts!',
    });
  }

  private async generateMilestoneCelebration(
    milestone: number,
    currentBalance: number,
  ): Promise<string> {
    const systemPrompt = `You are a friendly financial wellness advisor for Tantaropic, a Sharia-compliant micro-investment app.
Your job is to celebrate the user's investment milestones.
Keep messages short (2-3 sentences max), warm, and celebratory.
Acknowledge their discipline and encourage them to keep going.
Use simple language. Do not use emojis.`;

    const userPrompt = `The user's portfolio just crossed ${String(milestone)} EGP! Their current balance is ${String(currentBalance)} EGP.
Generate a brief, celebratory message acknowledging this milestone.`;

    return this.llm.complete({
      systemPrompt,
      userPrompt,
      // 2–3 sentences ≈ ~80 tokens; 150 leaves ~1.5× headroom.
      maxTokens: 150,
      fallback: `Congratulations! Your portfolio just crossed ${String(milestone)} EGP!`,
    });
  }

  private isDuplicateKeyError(error: unknown): boolean {
    // Prisma wraps unique-constraint violations as P2002.
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
