import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  NotFoundException,
} from '@nestjs/common';
import {
  I_EXCHANGE_PROVIDER,
  IExchangeProvider,
} from '../../common/interfaces/exchange-provider.interface';

import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { Money } from '../../common/domain/value-objects/money.vo';
import { AssetClass } from '../../common/enums';
import { EventType } from '../../common/events';
import type { AssetPriceChangedEventPayload } from '../../common/events/event-payload';
import type { PriceTick } from './dtos/price-tick.dto';
import { TRADEABLE_ASSETS } from './constants/tradeable-assets.constant';
import { MockExchangeService } from '../../external-api/mock-exchange/mock-exchange.service';

@Injectable()
export class PriceFeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PriceFeedService.name);
  private readonly cache = new Map<AssetClass, PriceTick>();

  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly jitterBps: number;

  constructor(
    @Inject(I_EXCHANGE_PROVIDER) private readonly exchange: IExchangeProvider,
    private readonly events: EventEmitter2,
    private readonly mockExchange: MockExchangeService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('PRICE_FEED_ENABLED', 'true') !== 'false';
    this.intervalMs = Number(
      config.get<string>('PRICE_FEED_INTERVAL_MS', '10000'),
    );
    this.jitterBps = Number(config.get<string>('PRICE_FEED_JITTER_BPS', '50'));
  }

  // ── Bootstrap: seed cache with raw (no jitter) prices ───────────────────
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Price feed disabled (PRICE_FEED_ENABLED=false)');
      return;
    }
    await this.seed();
  }

  // ── Public read API (used by controller + WalletProjection later) ───────
  getAll(): PriceTick[] {
    return [...this.cache.values()];
  }

  get(asset: AssetClass): PriceTick {
    const tick = this.cache.get(asset);
    if (!tick) throw new NotFoundException(`No price for ${asset}`);
    return tick;
  }

  // ── Polling loop ────────────────────────────────────────────────────────
  @Interval('price-feed', 10_000) // overridden by intervalMs at runtime via setInterval below if you prefer
  async tick(): Promise<void> {
    if (!this.enabled) return;

    const isFirstTick = this.cache.size === 0;

    const results = await Promise.allSettled(
      TRADEABLE_ASSETS.map((a) => this.fetchAndStore(a)),
    );

    if (isFirstTick) {
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        failed === 0
          ? `Seed: cached ${TRADEABLE_ASSETS.length} prices`
          : `Seed: ${failed}/${TRADEABLE_ASSETS.length} prices failed`,
      );
      return; // skip the per-asset summary on the seed tick
    }

    const summary = results
      .map((r, i) => {
        const asset = TRADEABLE_ASSETS[i];
        if (r.status === 'rejected') return `${asset}=ERR`;
        const t = this.cache.get(asset);
        return t
          ? `${asset} ${t.deltaBps >= 0 ? '+' : ''}${t.deltaBps}bps`
          : `${asset}=?`;
      })
      .join(', ');
    this.logger.log(`tick: ${summary}`);
  }

  // ── Internals ───────────────────────────────────────────────────────────
  private async seed(): Promise<void> {
    const results = await Promise.allSettled(
      TRADEABLE_ASSETS.map(async (asset) => {
        const price = await this.exchange.getLatestPrice(asset);
        this.cache.set(asset, {
          asset,
          pricePerUnit: price,
          previousPrice: null,
          deltaBps: 0,
          updatedAt: new Date(),
        });
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(
        `Seed: ${failed}/${TRADEABLE_ASSETS.length} prices failed`,
      );
    } else {
      this.logger.log(`Seed: cached ${TRADEABLE_ASSETS.length} prices`);
    }
  }

  private async fetchAndStore(asset: AssetClass): Promise<void> {
    const baseline = await this.exchange.getLatestPrice(asset);
    const jittered = this.applyJitter(baseline);

    const previous = this.cache.get(asset)?.pricePerUnit ?? null;
    const deltaBps = previous ? this.computeDeltaBps(previous, jittered) : 0;

    const tick: PriceTick = {
      asset,
      pricePerUnit: jittered,
      previousPrice: previous,
      deltaBps,
      updatedAt: new Date(),
    };
    this.cache.set(asset, tick);

    // Push the new price into the mock-exchange so BUY orders execute at the
    // same number the FE sees. Single source of truth.
    this.mockExchange.setPrice(asset, jittered.amount);

    const payload: AssetPriceChangedEventPayload = {
      asset,
      assetPrice: jittered,
      previousPrice: previous ?? undefined,
      deltaBps,
      userId: 'system',
      transactionId: `price-tick-${randomUUID()}`,
      timestamp: tick.updatedAt,
    };
    this.events.emit(EventType.SystemEventType.ASSET_PRICE_CHANGED, payload);
  }

  private applyJitter(base: Money): Money {
    if (this.jitterBps <= 0) return base;
    const factor = 1 + (Math.random() * 2 - 1) * (this.jitterBps / 10_000);
    const baseMinor = base.toMinorUnit().amount; // bigint
    const jitteredMinor = BigInt(
      Math.max(1, Math.round(Number(baseMinor) * factor)),
    );
    return Money.fromMinorUnit(jitteredMinor, base.currency);
  }

  private computeDeltaBps(prev: Money, curr: Money): number {
    const p = Number(prev.toMinorUnit().amount);
    const c = Number(curr.toMinorUnit().amount);
    if (p === 0) return 0;
    return Math.round(((c - p) / p) * 10_000);
  }
}
