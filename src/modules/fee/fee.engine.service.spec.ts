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
  grossAmount: Money.fromSmallestUnit(1000n, Currency.EGP),
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
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        walletId: 'wallet-1',
        type: LedgerEntryType.FUND_FEE,
        amount: 5n,
        currency: Currency.EGP,
        transactionEventId: 'txev-1',
        idempotencyKey: 'fund-fee:rd-key-1',
      }),
    });

    // Hand-off event carries NET amount, propagates upstream idempotency key.
    expect(events.emit).toHaveBeenCalledTimes(1);
    const [eventName, emittedPayload] = events.emit.mock.calls[0] as [
      string,
      EventsPayloads.FundsReadyForInvestmentEventPayload,
    ];
    expect(eventName).toBe(EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT);
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

    await expect(service.onRoundupDebited(buildPayload())).resolves.toBeUndefined();
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
      expect.objectContaining({
        data: expect.objectContaining({
          fiatBalance: { decrement: 4n },
        }),
      }),
    );
  });
});
