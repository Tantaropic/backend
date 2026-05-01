import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsRepository } from './ai-insights.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LlmService } from '../../common/llm';
import { EventType } from '../../common/events';
import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency } from '../../common/enums';
import type {
  TransactionWebhookReceivedEventPayload,
  WalletBalanceReconciledEventPayload,
} from '../../common/events/event-payload';

type RepoMock = {
  saveInsight: jest.Mock;
  findByUser: jest.Mock;
  findByIdempotencyKey: jest.Mock;
  findActiveWalletsWithUsers: jest.Mock;
};

type PrismaMock = {
  transactionEvent: { count: jest.Mock };
};

type LlmMock = { complete: jest.Mock };

const buildPayload = (
  overrides: Partial<TransactionWebhookReceivedEventPayload> = {},
): TransactionWebhookReceivedEventPayload => ({
  userId: 'user-1',
  transactionId: 'txn-1',
  transactionEventId: 'evt-1',
  idempotencyKey: 'idem-1',
  occurredAt: new Date(),
  merchantTag: 'coffee_shop',
  money: Money.fromMinorUnit(2500n, Currency.EGP), // 25 EGP
  ...overrides,
});

const buildWalletPayload = (
  overrides: Partial<WalletBalanceReconciledEventPayload> = {},
): WalletBalanceReconciledEventPayload => ({
  userId: 'user-1',
  transactionId: 'txn-1',
  money: Money.fromMinorUnit(50_000n, Currency.EGP), // 500 EGP -> crosses 100,500
  ...overrides,
});

describe('AiInsightsService', () => {
  let service: AiInsightsService;
  let repo: RepoMock;
  let prisma: PrismaMock;
  let llm: LlmMock;
  let emitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    repo = {
      saveInsight: jest.fn().mockResolvedValue({ id: 'insight-1' }),
      findByUser: jest.fn().mockResolvedValue([]),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findActiveWalletsWithUsers: jest.fn().mockResolvedValue([]),
    };
    prisma = { transactionEvent: { count: jest.fn().mockResolvedValue(3) } };
    llm = { complete: jest.fn().mockResolvedValue('وفر يا صديقي') };
    emitter = new EventEmitter2();
    emitSpy = jest.spyOn(emitter, 'emit');

    service = new AiInsightsService(
      repo as unknown as AiInsightsRepository,
      prisma as unknown as PrismaService,
      emitter,
      llm as unknown as LlmService,
    );
  });

  // ─── handleTransactionWebhook (nudges) ──────────────────────────────────

  describe('handleTransactionWebhook', () => {
    it('skips when userId is missing', async () => {
      await service.handleTransactionWebhook(
        buildPayload({ userId: '' as unknown as string }),
      );
      expect(llm.complete).not.toHaveBeenCalled();
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('skips when merchantTag is missing', async () => {
      await service.handleTransactionWebhook(
        buildPayload({ merchantTag: undefined }),
      );
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('skips when merchantTag is not nudge-worthy', async () => {
      await service.handleTransactionWebhook(
        buildPayload({ merchantTag: 'groceries' as never }),
      );
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('generates a nudge, persists it, and emits AI_INSIGHT_GENERATED', async () => {
      await service.handleTransactionWebhook(buildPayload());

      expect(prisma.transactionEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            merchantTag: 'coffee_shop',
          }),
        }),
      );
      expect(llm.complete).toHaveBeenCalledTimes(1);
      expect(repo.saveInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          message: 'وفر يا صديقي',
          transactionEventId: 'txn-1',
          idempotencyKey: 'ai-insight-idem-1',
          triggerTag: 'coffee_shop',
        }),
      );
      expect(emitSpy).toHaveBeenCalledWith(
        EventType.SystemEventType.AI_INSIGHT_GENERATED,
        expect.objectContaining({
          userId: 'user-1',
          insightId: 'insight-1',
          message: 'وفر يا صديقي',
        }),
      );
    });

    it('falls back to transactionId when idempotencyKey is missing', async () => {
      await service.handleTransactionWebhook(
        buildPayload({ idempotencyKey: undefined as unknown as string }),
      );
      expect(repo.saveInsight).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'ai-insight-txn-1' }),
      );
    });

    it('swallows repository errors and does not emit', async () => {
      repo.saveInsight.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.handleTransactionWebhook(buildPayload()),
      ).resolves.toBeUndefined();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  // ─── handleMilestoneCelebration ─────────────────────────────────────────

  describe('handleMilestoneCelebration', () => {
    it('skips when userId is missing', async () => {
      await service.handleMilestoneCelebration(
        buildWalletPayload({ userId: '' as unknown as string }),
      );
      expect(llm.complete).not.toHaveBeenCalled();
    });

    it('skips when balance is below the smallest milestone', async () => {
      await service.handleMilestoneCelebration(
        buildWalletPayload({
          money: Money.fromMinorUnit(5_000n, Currency.EGP),
        }), // 50 EGP
      );
      expect(repo.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('selects the highest crossed milestone', async () => {
      await service.handleMilestoneCelebration(
        buildWalletPayload({
          money: Money.fromMinorUnit(750_000n, Currency.EGP), // 7,500 EGP -> 5,000 milestone
        }),
      );
      expect(repo.findByIdempotencyKey).toHaveBeenCalledWith(
        'milestone-user-1-5000',
      );
      expect(repo.saveInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'milestone-user-1-5000',
          triggerTag: 'milestone_5000',
        }),
      );
    });

    it('skips LLM call when milestone insight already exists (pre-check)', async () => {
      repo.findByIdempotencyKey.mockResolvedValueOnce({ id: 'existing' });
      await service.handleMilestoneCelebration(buildWalletPayload());
      expect(llm.complete).not.toHaveBeenCalled();
      expect(repo.saveInsight).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('treats Prisma P2002 as a benign concurrent-write race', async () => {
      repo.saveInsight.mockRejectedValueOnce({ code: 'P2002' });
      await expect(
        service.handleMilestoneCelebration(buildWalletPayload()),
      ).resolves.toBeUndefined();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('persists and emits on a fresh milestone crossing', async () => {
      await service.handleMilestoneCelebration(buildWalletPayload());
      expect(llm.complete).toHaveBeenCalledTimes(1);
      expect(repo.saveInsight).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(
        EventType.SystemEventType.AI_INSIGHT_GENERATED,
        expect.objectContaining({ userId: 'user-1', insightId: 'insight-1' }),
      );
    });
  });

  // ─── getUserInsights ────────────────────────────────────────────────────

  describe('getUserInsights', () => {
    it('delegates to repository.findByUser', async () => {
      const rows = [{ id: 'i1' }, { id: 'i2' }];
      repo.findByUser.mockResolvedValueOnce(rows);
      await expect(service.getUserInsights('user-1')).resolves.toBe(rows);
      expect(repo.findByUser).toHaveBeenCalledWith('user-1');
    });
  });

  // ─── handleDailyPortfolioPulse ──────────────────────────────────────────

  describe('handleDailyPortfolioPulse', () => {
    const wallet = (
      overrides: Partial<{
        walletId: string;
        profileId: string;
        fiatBalance: bigint;
        userIds: string[];
        positions: Array<{ totalUnits: bigint; averageBuyPrice: bigint }>;
      }> = {},
    ) => ({
      walletId: 'wallet-1',
      profileId: 'profile-1',
      fiatBalance: 100_00n, // 100 EGP
      userIds: ['user-a', 'user-b'],
      positions: [{ totalUnits: 5n, averageBuyPrice: 200_00n }], // 5 * 200 EGP
      ...overrides,
    });

    it('skips when there are no active wallets', async () => {
      await service.handleDailyPortfolioPulse();
      expect(llm.complete).not.toHaveBeenCalled();
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('skips wallets with no users', async () => {
      repo.findActiveWalletsWithUsers.mockResolvedValueOnce([
        wallet({ userIds: [] }),
      ]);
      await service.handleDailyPortfolioPulse();
      expect(llm.complete).not.toHaveBeenCalled();
      expect(repo.saveInsight).not.toHaveBeenCalled();
    });

    it('skips wallets with zero balance and no positions', async () => {
      repo.findActiveWalletsWithUsers.mockResolvedValueOnce([
        wallet({ fiatBalance: 0n, positions: [] }),
      ]);
      await service.handleDailyPortfolioPulse();
      expect(llm.complete).not.toHaveBeenCalled();
    });

    it('writes one insight per user in the profile, sharing the LLM message', async () => {
      repo.findActiveWalletsWithUsers.mockResolvedValueOnce([wallet()]);
      await service.handleDailyPortfolioPulse();

      expect(llm.complete).toHaveBeenCalledTimes(1);
      expect(repo.saveInsight).toHaveBeenCalledTimes(2);

      const today = new Date().toISOString().slice(0, 10);
      expect(repo.saveInsight).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'user-a',
          triggerTag: 'daily_pulse',
          idempotencyKey: `pulse-user-a-${today}`,
          message: 'وفر يا صديقي',
        }),
      );
      expect(repo.saveInsight).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'user-b',
          idempotencyKey: `pulse-user-b-${today}`,
        }),
      );
      expect(emitSpy).toHaveBeenCalledWith(
        EventType.SystemEventType.AI_INSIGHT_GENERATED,
        expect.objectContaining({ userId: 'user-a' }),
      );
    });

    it('continues to other users when one save hits a P2002 race', async () => {
      repo.findActiveWalletsWithUsers.mockResolvedValueOnce([wallet()]);
      repo.saveInsight
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ id: 'insight-2' });

      await service.handleDailyPortfolioPulse();

      expect(repo.saveInsight).toHaveBeenCalledTimes(2);
      const aiEmits = emitSpy.mock.calls.filter(
        ([name]) => name === EventType.SystemEventType.AI_INSIGHT_GENERATED,
      );
      expect(aiEmits).toHaveLength(1);
    });

    it('isolates failures per wallet', async () => {
      repo.findActiveWalletsWithUsers.mockResolvedValueOnce([
        wallet({ walletId: 'w1', userIds: ['u1'] }),
        wallet({ walletId: 'w2', userIds: ['u2'] }),
      ]);
      llm.complete
        .mockRejectedValueOnce(new Error('llm down'))
        .mockResolvedValueOnce('فلوسك بتكبر');

      await service.handleDailyPortfolioPulse();

      expect(repo.saveInsight).toHaveBeenCalledTimes(1);
      expect(repo.saveInsight).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u2', message: 'فلوسك بتكبر' }),
      );
    });
  });

  // ─── End-to-end via EventEmitter wiring ─────────────────────────────────

  describe('event wiring (in-process E2E)', () => {
    it('handler runs when BANK_TRANSACTION_WEBHOOK_RECEIVED is emitted', async () => {
      const spy = jest.spyOn(service, 'handleTransactionWebhook');
      emitter.on(
        EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED,
        (p: TransactionWebhookReceivedEventPayload) =>
          service.handleTransactionWebhook(p),
      );
      const payload = buildPayload();
      emitter.emit(
        EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED,
        payload,
      );
      // allow async handler to settle
      await new Promise((r) => setImmediate(r));
      expect(spy).toHaveBeenCalledWith(payload);
      expect(repo.saveInsight).toHaveBeenCalled();
    });
  });
});
