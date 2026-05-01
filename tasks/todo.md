# Plan: Price Feed Service + Real-Time SSE

## Decisions (from Q&A)

- **Polling interval**: env-driven, default `10s` (`PRICE_FEED_INTERVAL_MS=10000`).
- **Storage**: in-memory cache only (no DB persistence, no historical snapshots).
- **Wallet recalc**: in-memory only on each tick; no DB writes. Persisted `currentValue` continues to be updated by transaction flows.
- **SSE channels**: `prices` (global), `wallet` (per-user), `transactions` (per-user), `ai-nudges` (per-user).
- **SSE auth**: anonymous, `?userId=` query param (hackathon-grade).
- **Transport**: `EventEmitter2` → `@Sse()` bridge via RxJS.
- **Volatility**: ±0.5% random jitter applied client-side in Price Feed Service on each tick (MockExchange remains source of truth baseline).
- **Out of scope**: persisted price history, multi-instance Redis fan-out, AI nudge producer (channel exists, producer comes later).

---

## Architecture

```
┌──────────────────────┐  poll (10s)   ┌─────────────────┐
│ PriceFeedService     │ ───────────▶  │ MockExchangeAPI │
│ (@nestjs/schedule)   │ ◀───────────  └─────────────────┘
│  - jitter ±0.5%      │
│  - in-mem cache      │ emit ASSET_PRICE_CHANGED
└──────────┬───────────┘─────────────────────────┐
           │                                     ▼
           │                       ┌──────────────────────────┐
           │                       │ WalletProjectionService  │
           │                       │ (listens, recomputes     │
           │                       │  wallet snapshot in mem) │
           │                       └────────────┬─────────────┘
           │                                    │ emit wallet.updated.<userId>
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│ EventEmitter2 (global bus)                                  │
└──────────────┬──────────────────────────────────────────────┘
               │ subscribe
               ▼
       ┌────────────────┐    GET /sse/stream?userId=...
       │ SseController  │ ◀──────────────── client (EventSource)
       │  @Sse()        │
       └────────────────┘
```

Producers (existing/future) emit on the same bus → SSE bridge multiplexes to subscribers:
- `roundup-engine` → `transaction.created.<userId>`
- (future) `ai-engine`  → `ai.nudge.<userId>`

---

## Module 1 — `PriceFeedModule` (`src/modules/price-feed/`)

Files to create:
- `price-feed.module.ts`
- `price-feed.service.ts` — `@Cron`/`setInterval` poller, in-mem `Map<AssetClass, PriceTick>`, applies jitter, emits `ASSET_PRICE_CHANGED`.
- `price-feed.controller.ts` — `GET /prices` returns current cached snapshot (handy for first-paint before SSE connects).
- `dtos/price-tick.dto.ts` — `{ assetClass, pricePerUnit, currency, updatedAt, deltaBps }`.

Behavior:
1. On bootstrap, fetch all prices from `ExchangeIntegrationService.getPrices()` and seed cache.
2. Every `PRICE_FEED_INTERVAL_MS` (default 10000): re-fetch baseline, apply ±0.5% jitter, store, emit per-asset event with delta in bps vs last tick.
3. Expose `getCurrentPrices()` and `getPrice(assetClass)` for in-process consumers (Wallet projection).
4. Failure handling: log + keep last-known cache; emit nothing on failure tick.

Env additions (README/env section):
- `PRICE_FEED_INTERVAL_MS=10000`
- `PRICE_FEED_JITTER_BPS=50`  (50 bps = ±0.5%)
- `PRICE_FEED_ENABLED=true`

Dependency: `@nestjs/schedule` (add to `package.json`).

---

## Module 2 — `RealtimeModule` (`src/modules/realtime/`)

Files to create:
- `realtime.module.ts`
- `sse.controller.ts` — endpoints below; uses `@Sse()` returning `Observable<MessageEvent>`.
- `sse.gateway.service.ts` — owns RxJS `Subject<SseEnvelope>` per channel; subscribes to `EventEmitter2` and translates internal events → SSE envelopes.
- `dtos/sse-envelope.dto.ts` — `{ channel, type, userId?, data, ts }`.

Endpoints:
- `GET /sse/stream?userId=<uuid>` — multiplexed stream. Server filters per-user events by `userId`. Always forwards global `prices` events.
- `GET /sse/prices` — prices-only global stream (no auth needed).
- `GET /sse/wallet?userId=<uuid>` — wallet-only per-user.

Per connection:
- Send initial `hello` event with cached prices + (if userId) latest wallet snapshot.
- Heartbeat comment line every 15s to keep idle proxies/Container Apps from dropping the stream.
- On disconnect, unsubscribe RxJS subscriptions cleanly.

Security note (hackathon-grade): we trust `userId` from query string. Document clearly in code + README; flag for future JWT hardening.

---

## Module 3 — `WalletProjectionService` (lives in `src/modules/wallet/`)

- New file: `wallet-projection.service.ts`.
- Listens for `ASSET_PRICE_CHANGED`.
- For each price tick, recomputes per-user wallet value **only for actively connected SSE users** (subscriber set kept by `RealtimeModule`, exposed via a small `ActiveUserRegistry`).
- Reads positions via existing `WalletRepository` (cached briefly, e.g. 5s TTL Map) to avoid DB hammering.
- Emits `wallet.updated.<userId>` with `{ totalValue, perAsset[] }`.

Why connection-aware: avoids recomputing for every user every 10s when most are offline.

---

## Event Bus Additions (`SystemEventType`)

Add:
- `WALLET_VALUE_PROJECTED = 'wallet.value_projected'`
- `AI_NUDGE_GENERATED   = 'ai.nudge_generated'`  (placeholder for later producer)

`ASSET_PRICE_CHANGED` already exists — reuse it.

Payload typings extended in `common/events/event-payload.ts`.

---

## Wiring Hooks for Existing Producers

- `RoundUpEngine` already exists; ensure it emits a transaction event the SSE bridge can forward (`transaction.created.<userId>`). If event not present, add a thin emit at the end of the existing handler — **no logic change**.

---

## Out of Scope (explicitly deferred)

- Persisted `PriceSnapshot` table + history endpoint.
- Redis pub/sub for multi-replica SSE fan-out (single Container App replica only for now).
- AI nudge producer (channel reserved, producer ticket separate).
- JWT-authenticated SSE.
- Frontend client code/examples.

---

## Implementation Checklist

- [ ] Add `@nestjs/schedule` dependency.
- [ ] Add `SystemEventType.WALLET_VALUE_PROJECTED` + `AI_NUDGE_GENERATED` + payload types.
- [ ] Create `PriceFeedModule` (service + controller + DTO + cron).
- [ ] Create `RealtimeModule` (controller + gateway service + envelope DTO + active-user registry).
- [ ] Create `WalletProjectionService` in `WalletModule`.
- [ ] Register both new modules in `app.module.ts`.
- [ ] Update env example / README with new env vars.
- [ ] Manual test: `curl -N http://localhost:3000/sse/prices` shows tick events; `?userId=...` shows wallet updates after a round-up.
- [ ] Lint + build.

---

## Review (filled after implementation)

_TBD_
