import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../database/prisma/prisma.service';
import { ActiveUserRegistry } from '../../common/realtime/active-user.registry';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { Money } from '../../common/domain/value-objects/money.vo';
import { AssetClass, Currency } from '../../common/enums';
import { EventType } from '../../common/events';
import type { WalletValueProjectedEventPayload } from '../../common/events/event-payload';

interface CachedWallet {
  walletId: string;
  profileId: string;
  fiatBalance: bigint;
  positions: Array<{ assetClass: AssetClass; totalUnits: bigint }>;
  fetchedAt: number;
}

const WALLET_CACHE_TTL_MS = 5_000;

@Injectable()
export class WalletProjectionService {
  private readonly logger = new Logger(WalletProjectionService.name);
  private readonly walletCache = new Map<string, CachedWallet>(); // userId → wallet
  private readonly lastTotalValue = new Map<string, bigint>(); // userId → minor units

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ActiveUserRegistry,
    private readonly prices: PriceFeedService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(EventType.SystemEventType.ASSET_PRICE_CHANGED)
  async onPriceTick(): Promise<void> {
    const userIds = this.registry.list();
    if (userIds.length === 0) return;

    // Fan-out per user; isolate failures.
    await Promise.allSettled(userIds.map((u) => this.projectForUser(u)));
  }

  /** Public for SSE `hello` priming. */
  async projectForUser(
    userId: string,
  ): Promise<WalletValueProjectedEventPayload | null> {
    try {
      const wallet = await this.loadWallet(userId);
      if (!wallet) return null;

      const perAsset = wallet.positions.map((p) => {
        const tick = this.prices.getAll().find((t) => t.asset === p.assetClass);
        const price =
          tick?.pricePerUnit ?? Money.fromMinorUnit(0n, Currency.EGP);
        // value (minor) = units × pricePerUnitMinor. Both are bigint.
        const valueMinor = p.totalUnits * price.toMinorUnit().amount;
        return {
          asset: p.assetClass,
          units: p.totalUnits,
          pricePerUnit: price,
          value: Money.fromMinorUnit(valueMinor, Currency.EGP),
        };
      });

      const totalMinor =
        wallet.fiatBalance +
        perAsset.reduce((acc, a) => acc + a.value.toMinorUnit().amount, 0n);

      const previous = this.lastTotalValue.get(userId);
      const deltaBps =
        previous && previous !== 0n
          ? Number(((totalMinor - previous) * 10_000n) / previous)
          : 0;
      this.lastTotalValue.set(userId, totalMinor);

      const payload: WalletValueProjectedEventPayload = {
        userId,
        profileId: wallet.profileId,
        walletId: wallet.walletId,
        fiatBalance: Money.fromMinorUnit(wallet.fiatBalance, Currency.EGP),
        totalValue: Money.fromMinorUnit(totalMinor, Currency.EGP),
        deltaBps,
        perAsset,
        projectedAt: new Date(),
      };

      this.events.emit(
        EventType.SystemEventType.WALLET_VALUE_PROJECTED,
        payload,
      );
      return payload;
    } catch (err) {
      this.logger.warn(`projection failed for ${userId}: ${String(err)}`);
      return null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────
  private async loadWallet(userId: string): Promise<CachedWallet | null> {
    const cached = this.walletCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < WALLET_CACHE_TTL_MS) {
      return cached;
    }

    // user → profile → wallet (+ positions). Profile may have no wallet yet.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profileId: true,
        profile: {
          select: {
            wallet: {
              select: {
                id: true,
                profileId: true,
                fiatBalance: true,
                positions: {
                  select: { assetClass: true, totalUnits: true },
                },
              },
            },
          },
        },
      },
    });

    const w = user?.profile?.wallet;
    if (!w) return null;

    const fresh: CachedWallet = {
      walletId: w.id,
      profileId: w.profileId,
      fiatBalance: w.fiatBalance,
      positions: w.positions,
      fetchedAt: Date.now(),
    };
    this.walletCache.set(userId, fresh);
    return fresh;
  }
}
