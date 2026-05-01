/**
 * Integration test: exercises AiInsightsService against the REAL LlmService
 * (live Azure GitHub Models endpoint). Only the DB layer is stubbed.
 *
 * Skipped automatically when GITHUB_TOKEN is not set so unit-test CI stays green.
 * Run locally with:
 *   npx jest src/modules/ai-insights/ai-insights.integration.spec.ts --runInBand
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LlmService } from '../../common/llm';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsRepository } from './ai-insights.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency } from '../../common/enums';
import type {
  TransactionWebhookReceivedEventPayload,
  WalletBalanceReconciledEventPayload,
} from '../../common/events/event-payload';

const hasToken = Boolean(process.env.GITHUB_TOKEN);
const describeIfLive = hasToken ? describe : describe.skip;

describeIfLive('AiInsightsService (live LLM integration)', () => {
  jest.setTimeout(60_000);

  let service: AiInsightsService;
  let savedInsights: Array<{
    userId: string;
    message: string;
    triggerTag?: string;
    idempotencyKey?: string;
  }>;

  beforeAll(() => {
    const config = new ConfigService(process.env);
    const llm = new LlmService(config);

    savedInsights = [];
    const repo = {
      saveInsight: jest.fn((data: (typeof savedInsights)[number]) => {
        savedInsights.push(data);
        return { id: `insight-${savedInsights.length}` };
      }),
      findByUser: jest.fn().mockResolvedValue([]),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findActiveWalletsWithUsers: jest.fn().mockResolvedValue([
        {
          walletId: 'live-wallet-1',
          profileId: 'live-profile-1',
          fiatBalance: 250_00n, // 250 EGP
          userIds: ['live-user-3', 'live-user-4'],
          positions: [
            { totalUnits: 10n, averageBuyPrice: 150_00n }, // 1,500 EGP invested
          ],
        },
      ]),
    } as unknown as AiInsightsRepository;

    const prisma = {
      transactionEvent: { count: jest.fn().mockResolvedValue(5) },
    } as unknown as PrismaService;

    service = new AiInsightsService(repo, prisma, new EventEmitter2(), llm);
  });

  it('generates a real spending nudge in Egyptian Arabic', async () => {
    const payload: TransactionWebhookReceivedEventPayload = {
      userId: 'live-user-1',
      transactionId: `txn-${Date.now()}`,
      transactionEventId: 'evt-live-1',
      idempotencyKey: `idem-${Date.now()}`,
      occurredAt: new Date(),
      merchantTag: 'coffee_shop',
      money: Money.fromMinorUnit(7_500n, Currency.EGP), // 75 EGP
    };

    await service.handleTransactionWebhook(payload);

    expect(savedInsights).toHaveLength(1);
    const [insight] = savedInsights;

    console.log('\n[LLM nudge]\n', insight.message, '\n');

    expect(insight.triggerTag).toBe('coffee_shop');
    expect(insight.message.length).toBeGreaterThan(10);
    expect(insight.message.length).toBeLessThan(800);
    // Must not be the hardcoded fallback string.
    expect(insight.message).not.toBe('كمل استثمار، كل قرش بيفرق!');
    // Should contain Arabic characters.
    expect(insight.message).toMatch(/[\u0600-\u06FF]/);
  });

  it('generates a real milestone celebration in Egyptian Arabic', async () => {
    const payload: WalletBalanceReconciledEventPayload = {
      userId: 'live-user-2',
      transactionId: `txn-ms-${Date.now()}`,
      money: Money.fromMinorUnit(120_000n, Currency.EGP), // 1,200 EGP -> crosses 1,000
    };

    const before = savedInsights.length;
    await service.handleMilestoneCelebration(payload);
    const created = savedInsights.slice(before);

    expect(created).toHaveLength(1);
    const [insight] = created;

    console.log('\n[LLM milestone]\n', insight.message, '\n');

    expect(insight.triggerTag).toBe('milestone_1000');
    expect(insight.idempotencyKey).toBe('milestone-live-user-2-1000');
    expect(insight.message.length).toBeGreaterThan(10);
    expect(insight.message).not.toBe('مبروك! محفظتك عدت 1000 جنيه!');
    expect(insight.message).toMatch(/[\u0600-\u06FF]/);
  });

  it('generates a real daily portfolio-pulse insight per user', async () => {
    const before = savedInsights.length;
    await service.handleDailyPortfolioPulse();
    const created = savedInsights.slice(before);

    // Two users in the wallet's profile -> two rows, same message.
    expect(created).toHaveLength(2);
    expect(created[0].message).toBe(created[1].message);
    expect(created[0].triggerTag).toBe('daily_pulse');

    console.log('\n[LLM daily pulse]\n', created[0].message, '\n');

    expect(created[0].message.length).toBeGreaterThan(10);
    expect(created[0].message).toMatch(/[\u0600-\u06FF]/);
    // Idempotency keys are dated and per-user
    expect(created[0].idempotencyKey).toMatch(
      /^pulse-live-user-3-\d{4}-\d{2}-\d{2}$/,
    );
    expect(created[1].idempotencyKey).toMatch(
      /^pulse-live-user-4-\d{4}-\d{2}-\d{2}$/,
    );
  });
});
