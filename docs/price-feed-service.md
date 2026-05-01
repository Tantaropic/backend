# Price Feed Service

Periodic poller that pulls current asset prices from the `MockExchangeAPI`,
keeps them in an in-memory cache, applies a small ±0.5% jitter to make demos
feel alive, and broadcasts every tick on the internal event bus so that the
SSE layer and the Wallet Projection can react in real time.

> **Status:** design + implementation spec for `PriceFeedModule`.
> **Scope:** Price polling, caching, broadcasting only. SSE transport and
> Wallet Projection are documented separately.

---

## 1. Goals & Non-Goals

### Goals
- Single source of truth for "current price" inside the backend.
- Push prices to clients on a fixed cadence so the dashboard ticks live.
- Add demo-friendly volatility without changing the upstream MockExchange.
- Be a good event-bus citizen: emit one well-typed event per asset per tick.
- Survive transient MockExchange failures without crashing or going silent.

### Non-Goals
- Persisting historical price snapshots (no DB writes).
- Order-book / depth simulation. Single mid price per asset class.
- Per-user price views. Prices are global.
- Driving wallet `currentValue` writes. Only **projected** values flow through SSE.
- Multi-replica coordination. Single replica only — see §10.

---

## 2. Where it Sits

```
┌────────────────┐  poll (every N s)   ┌──────────────────┐
│ MockExchange   │ ◀──── HTTP GET ──── │ PriceFeedService │
│  /prices       │ ────► JSON ───────▶ │  - in-mem cache  │
└────────────────┘                     │  - jitter ±0.5%  │
                                       └────────┬─────────┘
                                                │ emit ASSET_PRICE_CHANGED
                                                ▼
                              ┌──────────────────────────────────┐
                              │ EventEmitter2 (existing bus)     │
                              └──┬───────────────────────────┬───┘
                                 │                           │
                                 ▼                           ▼
                       SseDispatcherService        WalletProjectionService
                            (prices channel)         (recompute live users)
```

`PriceFeedService` knows nothing about SSE or wallets — it just polls and
emits. Consumers stay decoupled.

---

## 3. Data Model

### Cache entry (`PriceTick`)
```ts
{
  asset: AssetClass;          // 'GOLD' | 'INDEX_FUND' | 'HIGH_RISK'
  pricePerUnit: Money;        // major unit, EGP
  previousPrice: Money | null;
  deltaBps: number;           // signed, 0 on first tick
  updatedAt: Date;
  source: 'mock-exchange';
}
```

Stored in `Map<AssetClass, PriceTick>` in process memory. No DB.

### Emitted event
Reuses **existing** `SystemEventType.ASSET_PRICE_CHANGED` and the existing
`AssetPriceChangedEventPayload`:

```ts
type AssetPriceChangedEventPayload = {
  assetId?: string;
  asset: AssetClass;
  assetPrice: Money;
  // BaseEventPayload fields (timestamp, userId='system', transactionId='price-tick-<uuid>')
};
```

`userId` is set to a sentinel `'system'`; `transactionId` is a synthetic id so
the existing payload typing is satisfied without forking it. SSE dispatcher
treats `prices` as a global channel and ignores `userId`.

> If we later need richer fields (`deltaBps`, `previousPrice`), extend the
> payload type rather than introducing a parallel event.

---

## 4. Public API

Base path: `/prices`. Read-only, public.

### `GET /prices`
Returns the full cached snapshot. Used by the frontend on first paint before
the SSE stream has produced a tick.

```json
{
  "data": [
    {
      "asset": "GOLD",
      "pricePerUnit": { "amount": "452.25", "currency": "EGP" },
      "deltaBps": 50,
      "updatedAt": "2026-05-01T10:23:45.123Z"
    },
    { "asset": "INDEX_FUND", "...": "..." },
    { "asset": "HIGH_RISK",  "...": "..." }
  ]
}
```

### `GET /prices/:asset`
Single asset variant. `404` if the asset is unknown or the cache hasn't been
seeded yet.

> No write endpoints. Admin-style price control belongs on
> `MockExchangeAPI` (`/mock-exchange/set-prices`).

---

## 5. Polling Loop

Driven by `@nestjs/schedule`:

```ts
@Interval('price-feed', PRICE_FEED_INTERVAL_MS)
async tick(): Promise<void> { ... }
```

Per tick:
1. **Skip** if `PRICE_FEED_ENABLED=false`.
2. Call `ExchangeIntegrationService.getLatestPrice(asset)` for each
   `AssetClass`. Parallelise with `Promise.allSettled` — one bad asset
   shouldn't poison the others.
3. For each successful result:
   - Apply **jitter**: `jittered = base * (1 + random[-0.005, +0.005])`.
   - Compute `deltaBps` vs the previous cached price.
   - Replace the cache entry.
   - Emit `ASSET_PRICE_CHANGED`.
4. Log a single summary line per tick (`prices: GOLD +12bps, INDEX_FUND -3bps, ...`).
   Never log every emitted event individually.

### Bootstrap
On `OnApplicationBootstrap`:
1. Fetch all prices once.
2. Seed the cache (no jitter on the first read so the baseline is honest).
3. Start the interval.

If the bootstrap fetch fails, **don't crash the app** — log an error and let
the next tick retry. The cache will simply be empty until then; `GET /prices`
returns an empty array.

---

## 6. Jitter

Why: MockExchange prices are static between admin updates. Without jitter the
dashboard would render a flat line during the demo.

How: bounded uniform random per tick.

```ts
const j = (Math.random() * 2 - 1) * (jitterBps / 10_000); // ±0.5% by default
const jittered = base.multiply(1 + j);                    // Money helper
```

Constraints:
- Jitter is applied to the **freshly fetched baseline**, not to the previously
  jittered value. This prevents random walk drift away from MockExchange.
- `jitterBps = 0` disables jitter entirely (tests, prod-realistic mode).
- `Money` arithmetic stays in minor units — never use floats for the stored
  value. Compute the multiplier as a number, then quantise back to minor units
  via `Money.fromMinorUnit(Math.round(baseMinor * (1 + j)), currency)`.

---

## 7. Configuration

| Env var                   | Default | Notes                                              |
| ------------------------- | ------- | -------------------------------------------------- |
| `PRICE_FEED_ENABLED`      | `true`  | Master switch. `false` = no polling, no events.   |
| `PRICE_FEED_INTERVAL_MS`  | `10000` | Tick cadence. Lower = more demo-friendly, more noise. |
| `PRICE_FEED_JITTER_BPS`   | `50`    | `50` = ±0.5%. Set `0` for no jitter.              |

Read once via `ConfigService` in the constructor. Don't reread per tick.

---

## 8. Module Layout

```
src/modules/price-feed/
  price-feed.module.ts
  price-feed.service.ts
  price-feed.controller.ts
  dto/
    price-tick.dto.ts          # outbound shape for GET /prices
```

Module imports `ExchangeIntegrationModule` and `ScheduleModule.forRoot()`
(the latter once at the app level if not already present).

Exports `PriceFeedService` so other in-process consumers (e.g.
`WalletProjectionService`) can read the cache synchronously instead of going
back over the bus.

---

## 9. Failure Handling

| Scenario                            | Behaviour                                                      |
| ----------------------------------- | -------------------------------------------------------------- |
| MockExchange returns 5xx / timeout  | Log `warn`, keep last cache, **emit nothing** for that asset.  |
| One asset fails, others succeed     | Emit for the successful ones only. `Promise.allSettled`.       |
| MockExchange returns malformed JSON | Log `error`, skip that asset, do not crash.                    |
| `PRICE_FEED_ENABLED=false`          | Tick returns immediately. No HTTP, no events. `GET /prices` still serves the last cached snapshot (possibly empty). |
| Jitter produces non-positive value  | Clamp to `1` minor unit. Log `warn`. (Should never happen at 0.5%.) |

No retry loop inside a tick. The next tick is the retry.

---

## 10. Operational Notes

- **Single replica.** Each replica polls independently; multiple replicas
  would emit duplicate events and disagree on jitter. Pin Container Apps to
  `minReplicas = maxReplicas = 1` until a Redis-coordinated leader is added.
- **Demo cadence vs cost.** 10s × 3 assets = 18 calls/min to MockExchange.
  Fine in-process; if MockExchange ever moves out, raise the interval.
- **Clock drift.** `@nestjs/schedule` uses `setInterval`. After a long pause
  (laptop sleep) Node may fire many times back-to-back; the loop is idempotent
  so this is harmless, but log volume will spike briefly.
- **Logs.** One INFO line per tick at most. WARN/ERROR for fetch failures.
  Never log every emitted event.

---

## 11. Testing

### Unit
- `price-feed.service.spec.ts`:
  - Bootstrap seeds the cache from `ExchangeIntegrationService` mock.
  - Tick emits one `ASSET_PRICE_CHANGED` per successful asset.
  - Jitter stays within `±jitterBps` of the baseline.
  - `Promise.allSettled` failure on one asset doesn't block the others.
  - `PRICE_FEED_ENABLED=false` ⇒ no HTTP, no emits.
  - `deltaBps` is signed and rounded vs the previous tick.

### Integration
- Spin a Nest test module with a stub `ExchangeIntegrationService`.
- Drive `service.tick()` manually (don't rely on real timers).
- Assert events arrive on `EventEmitter2` with the right shape.

### Manual
```powershell
curl http://localhost:5001/api/v1/prices
curl.exe -N "http://localhost:5001/api/v1/sse/prices"   # see live ticks via SSE
```

---

## 12. Implementation Checklist

- [ ] Add `@nestjs/schedule` to `package.json`; `ScheduleModule.forRoot()` in `AppModule`.
- [ ] Create `src/modules/price-feed/` skeleton (4 files in §8).
- [ ] Implement `PriceFeedService` with bootstrap + interval + jitter + emit.
- [ ] Implement `PriceFeedController` with `GET /prices` and `GET /prices/:asset`.
- [ ] Wire env vars in `ConfigService`; document defaults in `README.md`.
- [ ] Pin Container App replicas to 1 (`infra/container-app.bicep`).
- [ ] Unit specs per §11.
- [ ] Lint + build green.

---

## 13. Open Questions

- Should `deltaBps` and `previousPrice` be added to
  `AssetPriceChangedEventPayload`? Default = **yes**, the SSE consumer
  already needs them and adding fields is non-breaking.
- Should the cache be exposed via a getter to `WalletProjectionService` (sync
  read) or only via the event (push only)? Default = **both** — getter for
  on-demand reads (e.g. `hello` priming), event for the live loop.
