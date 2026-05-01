import { EventEmitter2 } from '@nestjs/event-emitter';

import { WalletProjectionService } from './wallet-projection.service';
import { ActiveUserRegistry } from '../../common/realtime/active-user.registry';
import { Money } from '../../common/domain/value-objects/money.vo';
import { AssetClass, Currency } from '../../common/enums';
import { EventType } from '../../common/events';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PriceFeedService } from '../price-feed/price-feed.service';

type PrismaMock = {
  user: { findUnique: jest.Mock };
};

type PricesMock = { getAll: jest.Mock };

const buildWalletRow = (
  positions: Array<{ assetClass: AssetClass; totalUnits: bigint }> = [],
  fiatBalance = 0n,
) => ({
  profileId: 'profile-1',
  profile: {
    wallet: {
      id: 'wallet-1',
      profileId: 'profile-1',
      fiatBalance,
      positions,
    },
  },
});

describe('WalletProjectionService', () => {
  let prisma: PrismaMock;
  let prices: PricesMock;
  let registry: ActiveUserRegistry;
  let emitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;
  let service: WalletProjectionService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    prices = {
      getAll: jest.fn().mockReturnValue([
        {
          asset: AssetClass.GOLD,
          pricePerUnit: Money.fromMinorUnit(45_000n, Currency.EGP),
        },
        {
          asset: AssetClass.INDEX_FUND,
          pricePerUnit: Money.fromMinorUnit(12_000n, Currency.EGP),
        },
      ]),
    };
    registry = new ActiveUserRegistry();
    emitter = new EventEmitter2();
    emitSpy = jest.spyOn(emitter, 'emit');

    service = new WalletProjectionService(
      prisma as unknown as PrismaService,
      registry,
      prices as unknown as PriceFeedService,
      emitter,
    );
  });

  describe('projectForUser', () => {
    it('returns null when the user has no wallet', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const result = await service.projectForUser('ghost');
      expect(result).toBeNull();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('emits WALLET_VALUE_PROJECTED with fiat-only total when no positions', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        buildWalletRow([], 100_000n),
      );

      const result = await service.projectForUser('u1');
      expect(result).not.toBeNull();
      expect(result!.totalValue.toMinorUnit().amount).toBe(100_000n);
      expect(result!.perAsset).toEqual([]);
      expect(emitSpy).toHaveBeenCalledWith(
        EventType.SystemEventType.WALLET_VALUE_PROJECTED,
        expect.objectContaining({ userId: 'u1', walletId: 'wallet-1' }),
      );
    });

    it('values positions using current prices and adds to fiat', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(
        buildWalletRow(
          [{ assetClass: AssetClass.GOLD, totalUnits: 2n }],
          50_000n, // 500 EGP fiat
        ),
      );

      const result = await service.projectForUser('u1');
      // value = units (2) * price (45_000 minor) = 90_000 minor
      // total = 50_000 fiat + 90_000 = 140_000
      expect(result!.totalValue.toMinorUnit().amount).toBe(140_000n);
      expect(result!.perAsset).toHaveLength(1);
      expect(result!.perAsset[0].asset).toBe(AssetClass.GOLD);
    });

    it('first projection has deltaBps = 0; second tracks change vs previous total', async () => {
      // Two consecutive projections for the same user.
      prisma.user.findUnique.mockResolvedValue(
        buildWalletRow([], 100_000n), // 1000 EGP both times
      );
      // First call seeds the cache → reuses internal cache for second call,
      // so we bypass cache by stubbing fetchedAt via a fresh service call after TTL.
      const first = await service.projectForUser('u1');
      expect(first!.deltaBps).toBe(0);

      // Force cache miss by waiting beyond TTL via timer manipulation
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
      // Bump fiat by +10% → +1000 bps expected
      prisma.user.findUnique.mockResolvedValueOnce(
        buildWalletRow([], 110_000n),
      );

      const second = await service.projectForUser('u1');
      expect(second!.deltaBps).toBe(1000);
    });
  });

  describe('onPriceTick', () => {
    it('does nothing when no users are subscribed', async () => {
      await service.onPriceTick();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('projects for every subscribed user on a price tick', async () => {
      registry.acquire('u1');
      registry.acquire('u2');
      prisma.user.findUnique.mockResolvedValue(buildWalletRow([], 100_000n));

      await service.onPriceTick();

      const projectionEvents = emitSpy.mock.calls.filter(
        ([name]) => name === EventType.SystemEventType.WALLET_VALUE_PROJECTED,
      );
      expect(projectionEvents).toHaveLength(2);
    });

    it('isolates per-user failures', async () => {
      registry.acquire('u1');
      registry.acquire('u2');
      prisma.user.findUnique
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(buildWalletRow([], 100_000n));

      await service.onPriceTick();

      const projectionEvents = emitSpy.mock.calls.filter(
        ([name]) => name === EventType.SystemEventType.WALLET_VALUE_PROJECTED,
      );
      expect(projectionEvents).toHaveLength(1);
    });
  });
});
