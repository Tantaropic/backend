import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import { EventType, type EventsPayloads } from '../../common/events';
import { UserRepository } from '../users/user.repository';
import { ActiveUserRegistry } from '../../common/realtime/active-user.registry';
import {
  type SseChannel,
  type SseEnvelope,
  serializeMoney,
  serializeBigInt,
} from './dtos/sse-envelope.dto';

// ─── Internal Types ──────────────────────────────────────────────────────────

interface SseConnection {
  id: string;
  userId: string | null;
  channels: Set<SseChannel>;
  subject: Subject<MessageEvent>;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;
const GLOBAL_KEY = '__global__';

/**
 * Bridges the internal EventEmitter2 bus to SSE clients.
 *
 * - Manages per-user SSE connections (subscribe / unsubscribe / push)
 * - Listens to system events via `@OnEvent` and serializes payloads
 * - Sends a hello snapshot on connect and a heartbeat every 15 s
 * - Does NOT write to the database or emit events back to the bus
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly connections = new Map<string, SseConnection[]>();
  private connectionCounter = 0;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly activeUsers: ActiveUserRegistry,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection Management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new SSE connection for the given user and channels.
   * @param userId  - User UUID, or `null` for global streams (prices).
   * @param channels - Which SSE channels this connection subscribes to.
   * @returns The `connectionId` (for cleanup) and the RxJS `Subject` piped to the HTTP response.
   */
  subscribe(
    userId: string | null,
    channels: SseChannel[],
  ): { connectionId: string; subject: Subject<MessageEvent> } {
    const connectionId = `sse-${String(++this.connectionCounter)}`;
    const key = userId ?? GLOBAL_KEY;

    const subject = new Subject<MessageEvent>();
    const heartbeatTimer = this.startHeartbeat(connectionId, subject);

    const connection: SseConnection = {
      id: connectionId,
      userId,
      channels: new Set(channels),
      subject,
      heartbeatTimer,
    };

    const existing = this.connections.get(key) ?? [];
    existing.push(connection);
    this.connections.set(key, existing);

    if (userId) this.activeUsers.acquire(userId);

    this.logger.log(
      `SSE connected: ${connectionId} (user: ${userId ?? 'global'}, channels: ${channels.join(', ')})`,
    );

    // Deferred — NestJS must subscribe to the Observable before we push.
    setImmediate(() => {
      void this.sendHelloSnapshot(connection);
    });

    return { connectionId, subject };
  }

  /**
   * Remove a connection on client disconnect.
   * Clears the heartbeat timer and completes the Subject.
   * @param connectionId - The ID returned by `subscribe()`.
   */
  unsubscribe(connectionId: string): void {
    for (const [key, connections] of this.connections.entries()) {
      const index = connections.findIndex((c) => c.id === connectionId);
      if (index !== -1) {
        const conn = connections[index];
        clearInterval(conn.heartbeatTimer);
        conn.subject.complete();
        if (conn.userId) this.activeUsers.release(conn.userId);
        connections.splice(index, 1);

        if (connections.length === 0) {
          this.connections.delete(key);
        }

        this.logger.log(`SSE disconnected: ${connectionId}`);
        return;
      }
    }
  }

  /** Clean up all connections on server shutdown. */
  onModuleDestroy(): void {
    for (const [, connections] of this.connections.entries()) {
      for (const conn of connections) {
        clearInterval(conn.heartbeatTimer);
        conn.subject.complete();
        if (conn.userId) this.activeUsers.release(conn.userId);
      }
    }
    this.connections.clear();
    this.logger.log('All SSE connections closed (module destroy)');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  /** New bank transaction received → `transactions` channel. */
  @OnEvent(EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED)
  handleTransactionReceived(
    payload: EventsPayloads.TransactionWebhookReceivedEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.money);

    this.pushToUser(payload.userId, {
      channel: 'transactions',
      type: EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        transactionEventId: payload.transactionEventId,
        amount,
        currency,
        merchantTag: payload.merchantTag ?? null,
        occurredAt: payload.occurredAt.toISOString(),
      },
      ts: new Date().toISOString(),
    });
  }

  /** Round-up completed (current emitter) → `wallet` channel. */
  @OnEvent(EventType.SystemEventType.WALLET_FUNDS_ROUNDUP)
  handleRoundUpCompleted(
    payload: EventsPayloads.RoundUpCompletedEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.grossRoundUpAmount);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.WALLET_FUNDS_ROUNDUP,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        transactionEventId: payload.transactionEventId,
        grossRoundUpAmount: amount,
        grossRoundUpCurrency: currency,
        merchantTag: payload.merchantTag ?? null,
      },
      ts: new Date().toISOString(),
    });
  }

  /** Round-up debited (safety handler for event-name fix) → `wallet` channel. */
  @OnEvent(EventType.SystemEventType.ROUNDUP_DEBITED)
  handleRoundUpDebited(
    payload: EventsPayloads.RoundupDebitedEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.grossAmount);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.ROUNDUP_DEBITED,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        walletId: payload.walletId,
        transactionEventId: payload.transactionEventId,
        grossAmount: amount,
        currency,
      },
      ts: new Date().toISOString(),
    });
  }

  /** Funds ready for investment (after fee deduction) → `transactions` channel. */
  @OnEvent(EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT)
  handleFundsReady(
    payload: EventsPayloads.FundsReadyForInvestmentEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.netAmount);

    this.pushToUser(payload.userId, {
      channel: 'transactions',
      type: EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        transactionEventId: payload.transactionEventId,
        walletId: payload.walletId,
        netAmount: amount,
        netCurrency: currency,
      },
      ts: new Date().toISOString(),
    });
  }

  /** AI insight generated → `ai-insights` channel. */
  @OnEvent(EventType.SystemEventType.AI_INSIGHT_GENERATED)
  handleAiInsight(
    payload: EventsPayloads.AiInsightGeneratedEventPayload,
  ): void {
    this.pushToUser(payload.userId, {
      channel: 'ai-insights',
      type: EventType.SystemEventType.AI_INSIGHT_GENERATED,
      userId: payload.userId,
      data: {
        insightId: payload.insightId,
        message: payload.message,
        profileId: payload.profileId ?? null,
      },
      ts: new Date().toISOString(),
    });
  }

  /** Withdrawal fee applied → `wallet` channel. */
  @OnEvent(EventType.SystemEventType.WITHDRAWAL_FEE_APPLIED)
  handleWithdrawalFeeApplied(
    payload: EventsPayloads.WithdrawalFeeAppliedEventPayload,
  ): void {
    const realizedProfit = serializeMoney(payload.realizedProfit);
    const profitFee = serializeMoney(payload.profitFee);
    const netToUser = serializeMoney(payload.netToUser);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.WITHDRAWAL_FEE_APPLIED,
      userId: payload.userId,
      data: {
        walletId: payload.walletId,
        withdrawalRequestId: payload.withdrawalRequestId,
        realizedProfit: realizedProfit.amount,
        profitFee: profitFee.amount,
        netToUser: netToUser.amount,
        currency: realizedProfit.currency,
      },
      ts: new Date().toISOString(),
    });
  }

  // ─── Future handlers (dormant until emitters exist) ────────────────────────

  /** Asset price changed → `prices` channel (global broadcast). */
  @OnEvent(EventType.SystemEventType.ASSET_PRICE_CHANGED)
  handleAssetPriceChanged(
    payload: EventsPayloads.AssetPriceChangedEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.assetPrice);
    const previous = payload.previousPrice
      ? serializeMoney(payload.previousPrice).amount
      : null;

    this.pushGlobal({
      channel: 'prices',
      type: EventType.SystemEventType.ASSET_PRICE_CHANGED,
      userId: null,
      data: {
        asset: payload.asset,
        assetId: payload.assetId ?? null,
        price: amount,
        currency,
        deltaBps: payload.deltaBps ?? 0,
        previousPrice: previous,
      },
      ts: new Date().toISOString(),
    });
  }

  /** Wallet value projected → `wallet` channel (per-user, on each price tick). */
  @OnEvent(EventType.SystemEventType.WALLET_VALUE_PROJECTED)
  handleWalletValueProjected(
    payload: EventsPayloads.WalletValueProjectedEventPayload,
  ): void {
    const fiat = serializeMoney(payload.fiatBalance);
    const total = serializeMoney(payload.totalValue);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.WALLET_VALUE_PROJECTED,
      userId: payload.userId,
      data: {
        profileId: payload.profileId,
        walletId: payload.walletId,
        fiatBalance: fiat.amount,
        totalValue: total.amount,
        currency: total.currency,
        deltaBps: payload.deltaBps,
        perAsset: payload.perAsset.map((a) => ({
          asset: a.asset,
          units: serializeBigInt(a.units),
          pricePerUnit: serializeMoney(a.pricePerUnit).amount,
          value: serializeMoney(a.value).amount,
        })),
        projectedAt: payload.projectedAt.toISOString(),
      },
      ts: new Date().toISOString(),
    });
  }

  /** Wallet balance reconciled → `wallet` channel. */
  @OnEvent(EventType.SystemEventType.WALLET_BALANCE_RECONCILED)
  handleWalletReconciled(
    payload: EventsPayloads.WalletBalanceReconciledEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.money);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.WALLET_BALANCE_RECONCILED,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        balance: amount,
        currency,
      },
      ts: new Date().toISOString(),
    });
  }

  /** Trade order executed → `wallet` channel. */
  @OnEvent(EventType.SystemEventType.TRADE_ORDER_EXECUTED)
  handleTradeExecuted(
    payload: EventsPayloads.TradeOrderExecutedEventPayload,
  ): void {
    const { amount, currency } = serializeMoney(payload.assetPrice);

    this.pushToUser(payload.userId, {
      channel: 'wallet',
      type: EventType.SystemEventType.TRADE_ORDER_EXECUTED,
      userId: payload.userId,
      data: {
        transactionId: payload.transactionId,
        orderId: payload.orderId,
        asset: payload.asset,
        assetPrice: amount,
        currency,
        orderQuantity: serializeBigInt(payload.orderQuantity),
      },
      ts: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Push Logic
  // ═══════════════════════════════════════════════════════════════════════════

  /** Push an envelope to all SSE connections for a specific user. */
  private pushToUser(userId: string, envelope: SseEnvelope): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.length === 0) return;

    const message = this.toMessageEvent(envelope);

    for (const conn of userConnections) {
      if (conn.channels.has(envelope.channel)) {
        try {
          conn.subject.next(message);
        } catch (error) {
          this.logger.warn(`Failed to push to ${conn.id}: ${String(error)}`);
        }
      }
    }
  }

  /** Push an envelope to ALL connections (global broadcast, e.g. prices). */
  private pushGlobal(envelope: SseEnvelope): void {
    const message = this.toMessageEvent(envelope);

    for (const [, connections] of this.connections.entries()) {
      for (const conn of connections) {
        if (conn.channels.has(envelope.channel)) {
          try {
            conn.subject.next(message);
          } catch (error) {
            this.logger.warn(
              `Failed to push global to ${conn.id}: ${String(error)}`,
            );
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Hello Snapshot
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send the initial `hello` event with the user's current wallet state.
   * Allows the frontend to render immediately without waiting for the first live event.
   */
  private async sendHelloSnapshot(connection: SseConnection): Promise<void> {
    try {
      let walletData: Record<string, unknown> | null = null;

      if (connection.userId) {
        const user = await this.userRepository.findByIdWithProfileAndWallet(
          connection.userId,
        );

        if (user?.profile?.wallet) {
          const wallet = user.profile.wallet;
          walletData = {
            id: wallet.id,
            fiatBalance: serializeBigInt(wallet.fiatBalance),
            positions: wallet.positions.map((p) => ({
              assetClass: p.assetClass,
              totalUnits: serializeBigInt(p.totalUnits),
              averageBuyPrice: serializeBigInt(p.averageBuyPrice),
            })),
            version: wallet.version,
          };
        }
      }

      const helloEnvelope: SseEnvelope = {
        channel: 'system',
        type: 'hello',
        userId: connection.userId,
        data: { wallet: walletData },
        ts: new Date().toISOString(),
      };

      connection.subject.next(this.toMessageEvent(helloEnvelope));
    } catch (error) {
      this.logger.warn(
        `Failed to send hello snapshot for ${connection.id}: ${String(error)}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Heartbeat
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a 15 s heartbeat to keep the connection alive through proxies.
   * Sent as a typed `ping` event so clients can `addEventListener('ping', ...)`
   * to ignore it instead of receiving it on the default `onmessage` handler.
   */
  private startHeartbeat(
    connectionId: string,
    subject: Subject<MessageEvent>,
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      try {
        subject.next({ data: '', type: 'ping' } as MessageEvent);
      } catch {
        this.logger.warn(`Heartbeat failed for ${connectionId}`);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Convert an SseEnvelope to a NestJS-compatible MessageEvent. */
  private toMessageEvent(envelope: SseEnvelope): MessageEvent {
    return {
      data: JSON.stringify(envelope),
      type: envelope.channel,
    } as MessageEvent;
  }
}
