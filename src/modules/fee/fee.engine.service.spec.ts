import { EventEmitter2 } from '@nestjs/event-emitter';
import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency, LedgerEntryType } from '../../common/enums';
import { EventType, EventsPayloads } from '../../common/events';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FeeCalculatorService } from './fee.calculator.service';
import { FeeEngineService } from './fee.engine.service';

/**
 * Tx mock: captures calls to digitalWallet.updateMany / profile.updateMany / ledgerEntry.create
 * so each test can assert what the engine wrote inside the $transaction callback.
 */
type TxMock = {
  digitalWallet: { updateMany: jest.Mock };
  profile: { updateMany: jest.Mock };
  ledgerEntry: { create: jest.Mock };
};

const buildPrismaMock = (overrides?: {
  walletUpdateCount?: number;
  profileUpdateCount?: number;
  ledgerCreateError?: unknown;
}) => {
  const tx: TxMock = {
    digitalWallet: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.walletUpdateCount ?? 1 }),
    },
    profile: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.profileUpdateCount ?? 1 }),
    },
    ledgerEntry: {
      create: overrides?.ledgerCreateError
        ? jest.fn().mockRejectedValue(overrides.ledgerCreateError)
        : jest.fn().mockResolvedValue({ id: 'ledger-1' }),
    },
  };

  const prisma = {
    digitalWallet: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        profileId: 'profile-1',
        version: 7,
        fiatBalance: 1000n,
        profile: { id: 'profile-1', aum: 0n, version: 3 },
      }),
    },
    $transaction: jest.fn(
      async (cb: (tx: TxMock) => Promise<unknown>) => await cb(tx),
    ),
  };

  return { prisma, tx };
};

const buildPayload = (
  o: Partial<EventsPayloads.RoundupDebitedEventPayload> = {},
): EventsPayloads.RoundupDebitedEventPayload => ({
  userId: 'user-1',
  walletId: 'wallet-1',
  transactionEventId: 'txev-1',
  transactionId: 'tx-1',
  grossAmount: Money.fromMinorUnit(1000n, Currency.EGP),
  idempotencyKey: 'rd-key-1',
  ...o,
});

describe('FeeEngineService - onRoundupDebited (FUND_FEE)', () => {
  let calculator: FeeCalculatorService;
  let events: { emit: jest.Mock };

  beforeEach(() => {
    calculator = new FeeCalculatorService();
    events = { emit: jest.fn() };
  });

  it('deducts fee, bumps AUM by net, posts FUND_FEE ledger entry, emits next event', async () => {
    const { prisma, tx } = buildPrismaMock();
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await service.onRoundupDebited(buildPayload());

    // Wallet OCC update: decrement fee (5), guard on version=7.
    expect(tx.digitalWallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1', version: 7 },
      data: {
        fiatBalance: { decrement: 5n },
        version: { increment: 1 },
      },
    });

    // Profile AUM increment uses NET (995), not gross.
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', version: 3 },
      data: {
        aum: { increment: 995n },
        version: { increment: 1 },
      },
    });

    // Ledger row carries the derived idempotency key + correct type/amount.
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          userId: 'user-1',
          walletId: 'wallet-1',
          type: LedgerEntryType.FUND_FEE,
          amount: 5n,
          currency: Currency.EGP,
          transactionEventId: 'txev-1',
          idempotencyKey: 'fund-fee:rd-key-1',
        }),
      }),
    );

    // Hand-off event carries NET amount, propagates upstream idempotency key.
    expect(events.emit).toHaveBeenCalledTimes(1);
    const [eventName, emittedPayload] = events.emit.mock.calls[0] as [
      string,
      EventsPayloads.FundsReadyForInvestmentEventPayload,
    ];
    expect(eventName).toBe(
      EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT,
    );
    expect(emittedPayload.netAmount.amount).toBe(995n);
    expect(emittedPayload.idempotencyKey).toBe('rd-key-1');
  });

  it('throws on wallet OCC conflict (count=0) and does NOT emit next event', async () => {
    const { prisma } = buildPrismaMock({ walletUpdateCount: 0 });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(service.onRoundupDebited(buildPayload())).rejects.toThrow(
      /wallet version mismatch/i,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('throws on profile OCC conflict (count=0) and does NOT emit next event', async () => {
    const { prisma } = buildPrismaMock({ profileUpdateCount: 0 });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(service.onRoundupDebited(buildPayload())).rejects.toThrow(
      /profile version mismatch/i,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('swallows P2002 duplicate-key (replay) and still emits next event', async () => {
    const { prisma } = buildPrismaMock({
      ledgerCreateError: { code: 'P2002', message: 'unique constraint' },
    });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(
      service.onRoundupDebited(buildPayload()),
    ).resolves.toBeUndefined();
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-P2002 errors', async () => {
    const { prisma } = buildPrismaMock({
      ledgerCreateError: new Error('connection lost'),
    });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(service.onRoundupDebited(buildPayload())).rejects.toThrow(
      /connection lost/,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('uses profile.aum to pick fee bracket (drops to 40bps when AUM > 1k USD)', async () => {
    const { prisma, tx } = buildPrismaMock();
    prisma.digitalWallet.findUniqueOrThrow.mockResolvedValue({
      id: 'wallet-1',
      profileId: 'profile-1',
      version: 1,
      fiatBalance: 0n,
      profile: { id: 'profile-1', aum: 1_000n * 100n + 1n, version: 1 },
    });

    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );
    await service.onRoundupDebited(buildPayload());

    // 1000 * 40 / 10_000 = 4
    expect(tx.digitalWallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          fiatBalance: { decrement: 4n },
        }),
      }),
    );
  });
});

// ─── Phase 3: WITHDRAWAL_REQUESTED → PROFIT_FEE ──────────────────────────────

import { AssetClass } from '../../common/enums';

type WithdrawalTxMock = {
  walletPosition: { updateMany: jest.Mock };
  profile: { updateMany: jest.Mock };
  ledgerEntry: { create: jest.Mock };
};

const buildWithdrawalPrismaMock = (overrides?: {
  positionUpdateCount?: number;
  profileUpdateCount?: number;
  ledgerCreateError?: unknown;
  positions?: Array<{
    id: string;
    assetClass: AssetClass;
    totalUnits: bigint;
    averageBuyPrice: bigint;
    version: number;
  }>;
}) => {
  const tx: WithdrawalTxMock = {
    walletPosition: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.positionUpdateCount ?? 1 }),
    },
    profile: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.profileUpdateCount ?? 1 }),
    },
    ledgerEntry: {
      create: overrides?.ledgerCreateError
        ? jest.fn().mockRejectedValue(overrides.ledgerCreateError)
        : jest.fn().mockResolvedValue({ id: 'ledger-pf' }),
    },
  };

  const positions = overrides?.positions ?? [
    {
      id: 'pos-gold',
      assetClass: AssetClass.GOLD,
      totalUnits: 100n,
      averageBuyPrice: 150n,
      version: 2,
    },
    {
      id: 'pos-index',
      assetClass: AssetClass.INDEX_FUND,
      totalUnits: 100n,
      averageBuyPrice: 100n,
      version: 5,
    },
  ];

  const prisma = {
    digitalWallet: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        profileId: 'profile-1',
        version: 7,
        profile: { id: 'profile-1', aum: 50_000n, version: 9 },
      }),
    },
    walletPosition: {
      findMany: jest.fn().mockResolvedValue(positions),
    },
    $transaction: jest.fn(
      async (cb: (tx: WithdrawalTxMock) => Promise<unknown>) => await cb(tx),
    ),
  };

  return { prisma, tx, positions };
};

const buildWithdrawalPayload = (
  o: Partial<EventsPayloads.WithdrawalRequestedEventPayload> = {},
): EventsPayloads.WithdrawalRequestedEventPayload => ({
  userId: 'user-1',
  walletId: 'wallet-1',
  withdrawalRequestId: 'wd-1',
  transactionId: 'tx-wd-1',
  idempotencyKey: 'wd-key-1',
  sales: [
    {
      assetClass: AssetClass.GOLD,
      units: 10n,
      executionPrice: Money.fromMinorUnit(200n, Currency.EGP),
    },
    {
      assetClass: AssetClass.INDEX_FUND,
      units: 20n,
      executionPrice: Money.fromMinorUnit(120n, Currency.EGP),
    },
  ],
  ...o,
});

describe('FeeEngineService - onWithdrawalRequested (PROFIT_FEE)', () => {
  let calculator: FeeCalculatorService;
  let events: { emit: jest.Mock };

  beforeEach(() => {
    calculator = new FeeCalculatorService();
    events = { emit: jest.fn() };
  });

  it('aggregates per-asset profit, posts PROFIT_FEE row, decrements positions/AUM, emits next event', async () => {
    // Sale math:
    //   GOLD:  10 units * 200 = 2000 proceeds; cost 10*150 = 1500; profit 500
    //   INDEX: 20 units * 120 = 2400 proceeds; cost 20*100 = 2000; profit 400
    //   Totals: proceeds=4400, cost=3500, profit=900
    //   Profit fee bracket(900 piasters) = 150 bps → fee = 900 * 150 / 10_000 = 13
    //   netToUser = 4400 - 13 = 4387
    const { prisma, tx } = buildWithdrawalPrismaMock();
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await service.onWithdrawalRequested(buildWithdrawalPayload());

    // Both positions decremented under OCC.
    expect(tx.walletPosition.updateMany).toHaveBeenCalledWith({
      where: { id: 'pos-gold', version: 2 },
      data: { totalUnits: { decrement: 10n }, version: { increment: 1 } },
    });
    expect(tx.walletPosition.updateMany).toHaveBeenCalledWith({
      where: { id: 'pos-index', version: 5 },
      data: { totalUnits: { decrement: 20n }, version: { increment: 1 } },
    });

    // AUM reduced by principal (cost), not proceeds.
    expect(tx.profile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', version: 9 },
      data: {
        aum: { decrement: 3500n },
        version: { increment: 1 },
      },
    });

    // Single PROFIT_FEE ledger row carrying the derived idempotency key.
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          userId: 'user-1',
          walletId: 'wallet-1',
          type: LedgerEntryType.PROFIT_FEE,
          amount: 13n,
          currency: Currency.EGP,
          idempotencyKey: 'profit-fee:wd-key-1',
        }),
      }),
    );

    // Hand-off event carries totals.
    expect(events.emit).toHaveBeenCalledTimes(1);
    const [eventName, emittedPayload] = events.emit.mock.calls[0] as [
      string,
      EventsPayloads.WithdrawalFeeAppliedEventPayload,
    ];
    expect(eventName).toBe(EventType.SystemEventType.WITHDRAWAL_FEE_APPLIED);
    expect(emittedPayload.realizedProfit.amount).toBe(900n);
    expect(emittedPayload.profitFee.amount).toBe(13n);
    expect(emittedPayload.netToUser.amount).toBe(4387n);
  });

  it('charges zero fee when sold at a loss (no profit)', async () => {
    const { prisma, tx } = buildWithdrawalPrismaMock({
      positions: [
        {
          id: 'pos-gold',
          assetClass: AssetClass.GOLD,
          totalUnits: 100n,
          averageBuyPrice: 300n, // bought higher than execution price → loss
          version: 1,
        },
      ],
    });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await service.onWithdrawalRequested(
      buildWithdrawalPayload({
        sales: [
          {
            assetClass: AssetClass.GOLD,
            units: 10n,
            executionPrice: Money.fromMinorUnit(200n, Currency.EGP),
          },
        ],
      }),
    );

    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          type: LedgerEntryType.PROFIT_FEE,
          amount: 0n,
        }),
      }),
    );
    const [, emittedPayload] = events.emit.mock.calls[0] as [
      string,
      EventsPayloads.WithdrawalFeeAppliedEventPayload,
    ];
    expect(emittedPayload.profitFee.amount).toBe(0n);
    expect(emittedPayload.netToUser.amount).toBe(2000n); // proceeds intact
  });

  it('throws on position OCC conflict and does NOT emit next event', async () => {
    const { prisma } = buildWithdrawalPrismaMock({ positionUpdateCount: 0 });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      service.onWithdrawalRequested(buildWithdrawalPayload()),
    ).rejects.toThrow(/position version mismatch/i);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('throws when a sale references an unknown asset position', async () => {
    const { prisma } = buildWithdrawalPrismaMock({ positions: [] });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      service.onWithdrawalRequested(buildWithdrawalPayload()),
    ).rejects.toThrow(/missing wallet position/i);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('throws when requested units exceed position holdings', async () => {
    const { prisma } = buildWithdrawalPrismaMock({
      positions: [
        {
          id: 'pos-gold',
          assetClass: AssetClass.GOLD,
          totalUnits: 5n,
          averageBuyPrice: 100n,
          version: 1,
        },
      ],
    });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      service.onWithdrawalRequested(
        buildWithdrawalPayload({
          sales: [
            {
              assetClass: AssetClass.GOLD,
              units: 10n,
              executionPrice: Money.fromMinorUnit(200n, Currency.EGP),
            },
          ],
        }),
      ),
    ).rejects.toThrow(/insufficient units/i);
  });

  it('swallows P2002 duplicate-key (replay) and still emits next event', async () => {
    const { prisma } = buildWithdrawalPrismaMock({
      ledgerCreateError: { code: 'P2002', message: 'unique constraint' },
    });
    const service = new FeeEngineService(
      prisma as unknown as PrismaService,
      calculator,
      events as unknown as EventEmitter2,
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      service.onWithdrawalRequested(buildWithdrawalPayload()),
    ).resolves.toBeUndefined();
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
});
