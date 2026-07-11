import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { PriceFeedService } from './price-feed.service';
import { Money } from '../../common/domain/value-objects/money.vo';
import { AssetClass, Currency } from '../../common/enums';
import { EventType } from '../../common/events';
import type { IExchangeProvider } from '../../common/interfaces/exchange-provider.interface';

type ExchangeMock = { getLatestPrice: jest.Mock };
type MockExchangeMock = { setPrice: jest.Mock };

const buildConfig = (overrides: Record<string, string> = {}): ConfigService => {
  const values: Record<string, string> = {
    PRICE_FEED_ENABLED: 'true',
    PRICE_FEED_INTERVAL_MS: '10000',
    PRICE_FEED_JITTER_BPS: '0', // deterministic by default
    ...overrides,
  };
  return {
    get: jest.fn(
      (key: string, fallback?: string): string => values[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
};

describe('PriceFeedService', () => {
  let exchange: ExchangeMock;
  let mockExchange: MockExchangeMock;
  let emitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;

  const goldPrice = (minor: bigint) => Money.fromMinorUnit(minor, Currency.EGP);

  beforeEach(() => {
    exchange = {
      getLatestPrice: jest.fn(),
    };
    mockExchange = {
      setPrice: jest.fn(),
    };
    emitter = new EventEmitter2();
    emitSpy = jest.spyOn(emitter, 'emit');
    // Math.random=0.5 → jitter factor multiplier = 1 (centered)
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => jest.restoreAllMocks());

  const newService = (config: ConfigService = buildConfig()) =>
    new PriceFeedService(
      exchange as unknown as IExchangeProvider,
      emitter,
      mockExchange as never,
      config,
    );

  describe('application bootstrap', () => {
    it('does not block startup while the initial prices are pending', () => {
      exchange.getLatestPrice.mockReturnValue(new Promise(() => undefined));

      const service = newService();
      const result = service.onApplicationBootstrap();

      expect(result).toBeUndefined();
      expect(exchange.getLatestPrice).toHaveBeenCalledTimes(3);
    });

    it('does not seed when PRICE_FEED_ENABLED=false', () => {
      const service = newService(
        buildConfig({ PRICE_FEED_ENABLED: 'false' }),
      );

      service.onApplicationBootstrap();

      expect(exchange.getLatestPrice).not.toHaveBeenCalled();
    });
  });

  describe('tick (lazy seed)', () => {
    it('emits ASSET_PRICE_CHANGED for every asset on first tick', async () => {
      exchange.getLatestPrice.mockImplementation((asset: AssetClass) => {
        const prices: Partial<Record<AssetClass, bigint>> = {
          [AssetClass.GOLD]: 45_000n,
          [AssetClass.INDEX_FUND]: 12_000n,
          [AssetClass.HIGH_RISK]: 8_500n,
        };
        return Promise.resolve(goldPrice(prices[asset] ?? 0n));
      });

      const service = newService();
      await service.tick();

      const priceEvents = emitSpy.mock.calls.filter(
        ([name]) => name === EventType.SystemEventType.ASSET_PRICE_CHANGED,
      );
      expect(priceEvents).toHaveLength(3);
      expect(service.getAll()).toHaveLength(3);
    });

    it('first-tick deltaBps is 0 for every asset', async () => {
      exchange.getLatestPrice.mockResolvedValue(goldPrice(45_000n));

      const service = newService();
      await service.tick();

      service.getAll().forEach((tick) => expect(tick.deltaBps).toBe(0));
    });
  });

  describe('subsequent ticks', () => {
    it('computes deltaBps vs previous price', async () => {
      // jitter off → identical baseline both ticks → delta = 0
      exchange.getLatestPrice.mockResolvedValue(goldPrice(45_000n));
      const service = newService();
      await service.tick(); // seed

      // bump baseline by +1% → +100 bps
      exchange.getLatestPrice.mockResolvedValue(goldPrice(45_450n));
      await service.tick();

      const gold = service.get(AssetClass.GOLD);
      expect(gold.deltaBps).toBe(100);
      expect(gold.previousPrice).toBeDefined();
    });
  });

  describe('failure isolation', () => {
    it('one failing asset does not block the others', async () => {
      exchange.getLatestPrice.mockImplementation((asset: AssetClass) => {
        if (asset === AssetClass.GOLD) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve(goldPrice(10_000n));
      });

      const service = newService();
      await service.tick();

      // Two successes emitted, GOLD missing
      const priceEvents = emitSpy.mock.calls.filter(
        ([name]) => name === EventType.SystemEventType.ASSET_PRICE_CHANGED,
      );
      expect(priceEvents).toHaveLength(2);
      expect(() => service.get(AssetClass.GOLD)).toThrow();
      expect(service.get(AssetClass.INDEX_FUND)).toBeDefined();
      expect(service.get(AssetClass.HIGH_RISK)).toBeDefined();
    });
  });

  describe('disabled feed', () => {
    it('tick is a no-op when PRICE_FEED_ENABLED=false', async () => {
      const service = newService(buildConfig({ PRICE_FEED_ENABLED: 'false' }));
      await service.tick();
      expect(exchange.getLatestPrice).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('jitter bounds', () => {
    it('keeps jittered price within ±jitterBps of baseline', async () => {
      const baseline = 100_000n; // 1000.00 EGP in piasters
      exchange.getLatestPrice.mockResolvedValue(goldPrice(baseline));

      // Random extremes
      const samples: number[] = [];
      const service = newService(buildConfig({ PRICE_FEED_JITTER_BPS: '50' }));
      for (let i = 0; i < 50; i++) {
        // alternate min/max randoms
        jest.spyOn(Math, 'random').mockReturnValue(i % 2 === 0 ? 0 : 1);
        await service.tick();
        const p = Number(
          service.get(AssetClass.GOLD).pricePerUnit.toMinorUnit().amount,
        );
        samples.push(p);
      }

      const minAllowed = Math.floor(Number(baseline) * (1 - 50 / 10_000));
      const maxAllowed = Math.ceil(Number(baseline) * (1 + 50 / 10_000));
      samples.forEach((s) => {
        expect(s).toBeGreaterThanOrEqual(minAllowed);
        expect(s).toBeLessThanOrEqual(maxAllowed);
      });
    });
  });
});
