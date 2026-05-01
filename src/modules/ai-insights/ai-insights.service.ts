import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
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
import {
  NUDGE_WORTHY_TAGS,
  MILESTONES,
  DAILY_PULSE_CRON,
  DAILY_PULSE_TZ,
} from '../../common/constants';

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
    const systemPrompt = `انت مستشار مالي ودود لتطبيق فكه تطبيق استثمار صغير متوافق مع الشريعة الإسلامية.
مهمتك إنك تشجع المستخدمين بلطف إنهم يستثمروا بدل ما يصرفوا زيادة.
اكتب بالعامية المصرية بأسلوب دافي ومحفز، وخلي الرسالة قصيرة (جملتين أو تلاتة بالكتير).
متبقاش حكم على حد ولا تبقى رسمي زيادة. ركز على إن الفلوس دي ممكن تتحول لإيه لو اتستثمرت.
استخدم كلام بسيط ومتحطش أي إيموجي.`;

    const userPrompt = `المستخدم لسه صرف ${String(amountSpent)} جنيه عند تاجر من نوع "${merchantTag.replace(/_/g, ' ')}".
وعمل ${String(recentCount)} عملية شرا مشابهة في آخر 30 يوم.
اكتبله رسالة قصيرة بالعامية المصرية تشجعه وتفكره إن الفلوس دي كان ممكن تبقى إيه لو استثمرها.`;

    return this.llm.complete({
      systemPrompt,
      userPrompt,
      // 2–3 sentences ≈ ~80 tokens; 150 leaves ~1.5× headroom.
      maxTokens: 150,
      fallback: 'كمل استثمار، كل قرش بيفرق!',
    });
  }

  private async generateMilestoneCelebration(
    milestone: number,
    currentBalance: number,
  ): Promise<string> {
    const systemPrompt = `انت مستشار مالي ودود لتطبيق فكه, تطبيق استثمار صغير متوافق مع الشريعة الإسلامية.
مهمتك إنك تحتفل مع المستخدم لما يوصل لإنجاز جديد في محفظته.
اكتب بالعامية المصرية بأسلوب دافي وفرحان، وخلي الرسالة قصيرة (جملتين أو تلاتة بالكتير).
اعترف بالتزامه وشجعه إنه يكمل. استخدم كلام بسيط ومتحطش أي إيموجي.`;

    const userPrompt = `محفظة المستخدم لسه عدت حاجز ${String(milestone)} جنيه! الرصيد الحالي ${String(currentBalance)} جنيه.
اكتبله رسالة قصيرة بالعامية المصرية تهنيه على الإنجاز ده.`;

    return this.llm.complete({
      systemPrompt,
      userPrompt,
      // 2–3 sentences ≈ ~80 tokens; 150 leaves ~1.5× headroom.
      maxTokens: 150,
      fallback: `مبروك! محفظتك عدت ${String(milestone)} جنيه!`,
    });
  }

  // ─── Daily Portfolio Pulse ────────────────────────────────────────────────

  /**
   * Daily 09:00 Africa/Cairo job: walks every active wallet, computes net
   * portfolio value, and writes a motivational AiInsight row PER USER in the
   * wallet's profile. Idempotent per (userId, day).
   */
  @Cron(DAILY_PULSE_CRON, { timeZone: DAILY_PULSE_TZ, name: 'ai-daily-pulse' })
  async handleDailyPortfolioPulse(): Promise<void> {
    this.logger.log('Daily portfolio pulse: starting');

    const wallets = await this.repository.findActiveWalletsWithUsers();
    if (wallets.length === 0) {
      this.logger.log('Daily pulse: no active wallets, skipping');
      return;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    for (const wallet of wallets) {
      const { fiatBalance, positions, userIds, walletId } = wallet;
      if (userIds.length === 0) continue;

      const hasPositions = positions.some((p) => p.totalUnits > 0n);
      if (fiatBalance <= 0n && !hasPositions) continue;

      // No live price feed yet → current value == net invested
      // (averageBuyPrice × units). Unrealized profit therefore = 0 for now.
      const netInvestedMinor = positions.reduce(
        (acc, p) => acc + p.totalUnits * p.averageBuyPrice,
        0n,
      );
      const totalNetMajor = Number((netInvestedMinor + fiatBalance) / 100n);

      try {
        const message = await this.generatePortfolioPulse(totalNetMajor);

        for (const userId of userIds) {
          const insightKey = `pulse-${userId}-${today}`;
          try {
            const insight = await this.repository.saveInsight({
              userId,
              message,
              idempotencyKey: insightKey,
              triggerTag: 'daily_pulse',
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
          } catch (error: unknown) {
            if (this.isDuplicateKeyError(error)) continue;
            this.logger.error(
              `Daily pulse: failed to save insight for user ${userId}: ${String(error)}`,
            );
          }
        }
      } catch (error: unknown) {
        this.logger.error(
          `Daily pulse: failed for wallet ${walletId}: ${String(error)}`,
        );
      }
    }

    this.logger.log(
      `Daily portfolio pulse: processed ${String(wallets.length)} wallets`,
    );
  }

  private async generatePortfolioPulse(netMajor: number): Promise<string> {
    const systemPrompt = `انت مستشار مالي ودود لتطبيق فكه، تطبيق استثمار صغير متوافق مع الشريعة الإسلامية.
مهمتك إنك تبعت رسالة يومية قصيرة للمستخدم تخليه يحس إن فلوسه بتكبر وتحفزه يكمل.
اكتب بالعامية المصرية بأسلوب دافي ومحفز، وخلي الرسالة قصيرة (جملتين أو تلاتة بالكتير).
ركز على إن كل جنيه بيتجمع بيقربه من هدفه. متحطش أي إيموجي.`;

    const userPrompt = `إجمالي محفظة المستخدم النهاردة ${String(netMajor)} جنيه (نقدي + استثمارات).
اكتبله رسالة قصيرة بالعامية المصرية تشجعه ويحس إن فلوسه بتكبر ويكمل في طريقه.`;

    return this.llm.complete({
      systemPrompt,
      userPrompt,
      maxTokens: 150,
      fallback: `محفظتك دلوقتي ${String(netMajor)} جنيه — كمل، كل يوم بتقرب من هدفك!`,
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
