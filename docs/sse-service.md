# Real-Time SSE Service

Server-Sent Events (SSE) layer that pushes live updates — wallet balances, asset
prices, new transactions, and AI nudges — from the NestJS backend to the
frontend over a single long-lived HTTP connection.

> **Status:** design + implementation spec for `RealtimeModule`.
> **Scope:** SSE only. Price Feed Service and Wallet Projection are documented
> separately.

---

## 1. Goals & Non-Goals

### Goals
- One transport for all real-time updates (prices, wallet, transactions, AI insights).
- Zero changes to existing producers — bridge the **existing `EventEmitter2` bus** to SSE.
- Survive Container Apps idle timeouts (heartbeats).
- Multiplexed per-user stream + lightweight global stream for prices.
- Hackathon-grade auth: `?userId=` query param. Clearly flagged for future hardening.

### Non-Goals
- WebSockets / bi-directional channel.
- Multi-replica fan-out (Redis pub/sub) — single Container App replica only.
- Persistent event log / replay on reconnect (browsers handle reconnect; clients re-sync via REST).
- JWT / signed-token auth on the stream (deferred).

---

## 2. Why SSE (not WebSockets)

| Concern             | SSE                                   | WebSocket                  |
| ------------------- | ------------------------------------- | -------------------------- |
| Direction           | Server → Client only ✓ (what we need) | Bi-directional             |
| Transport           | Plain HTTP/1.1 + `text/event-stream`  | Upgrade handshake          |
| Browser API         | Native `EventSource`, auto-reconnect  | Native `WebSocket`         |
| Container Apps / LB | Works with default HTTP ingress       | Needs sticky/WS-aware      |
| NestJS support      | First-class via `@Sse()` decorator    | Requires gateway adapter   |

We only push. SSE is simpler, lighter, and less to break.

---

## 3. Event Sources Already in the System

The bus is already wired. SSE just subscribes to these and forwards them.

| Internal event (`SystemEventType`)    | Producer                     | SSE channel       |
| ------------------------------------- | ---------------------------- | ----------------- |
| `ASSET_PRICE_CHANGED`                 | `PriceFeedService` (new)     | `prices` (global) |
| `WALLET_BALANCE_RECONCILED`           | wallet/round-up flows        | `wallet`          |
| `TRADE_ORDER_EXECUTED`                | `ExchangeIntegrationService` | `wallet`          |
| `FUNDS_READY_FOR_INVESTMENT`          | `FeeEngineService`           | `transactions`    |
| `BANK_TRANSACTION_WEBHOOK_RECEIVED`   | `BankIntegrationService`     | `transactions`    |
| `AI_INSIGHT_GENERATED`                | `AiInsightsService`          | `ai-insights`     |

All payloads carry `userId`. Wallet payload also resolvable to `profileId` via
the wallet repo (a user can own multiple profiles → multiple wallets).

---

## 4. Public API

Base path: `/sse`. Content type: `text/event-stream`.

### `GET /sse/stream?userId={uuid}`
Multiplexed stream. Forwards:
- All `prices` events (global, no filter).
- `wallet`, `transactions`, `ai-insights` events **filtered to `userId`**.

### `GET /sse/prices`
Global prices-only stream. No `userId` required.

### `GET /sse/wallet?userId={uuid}`
Convenience endpoint for the dashboard wallet widget. Wallet events only.

### Common response

Every event uses the same envelope (parsed by `JSON.parse(event.data)`):

```json
{
  "channel": "wallet",
  "type": "wallet.balance_reconciled",
  "userId": "uuid",
  "data": { "...": "channel-specific payload" },
  "ts": "2026-05-01T10:23:45.123Z"
}
```

The first frame on every connection is a `hello` event with the cached price
snapshot (and, when applicable, the latest wallet snapshot) so the UI can
render immediately without waiting for the next tick:

```
event: hello
data: {"channel":"system","type":"hello","data":{"prices":[...],"wallet":{...}},"ts":"..."}
```

A heartbeat comment line is sent every **15 seconds** to keep idle proxies
(Azure Container Apps front-door) from closing the connection:

```
: ping
```

Comment lines are ignored by `EventSource` clients.

---

## 5. Channel Reference

| Channel       | `type` values                                              | Payload (`data`)                                                                   |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `prices`      | `exchange.price_changed`                                   | `{ asset, pricePerUnit, currency, deltaBps, updatedAt }`                           |
| `wallet`      | `wallet.balance_reconciled`, `trade.order_executed`        | `{ profileId, walletId, fiatBalance, totalValue, perAsset[], money? }`             |
| `transactions`| `bank.transaction_webhook_received`, `funds.ready_for_investment` | `{ transactionId, merchantTag?, money, occurredAt? }`                       |
| `ai-insights` | `ai.insight_generated`                                     | `{ insightId, message }`                                                           |
| `system`      | `hello`, `error`                                           | `{ ... }`                                                                          |

`Money` is serialized with the existing `JsonHelper` (`{ amount, currency }`,
amount as **major-unit string**, never `bigint`).

---

## 6. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ EventEmitter2 (existing global bus)                          │
│   ASSET_PRICE_CHANGED · WALLET_BALANCE_RECONCILED · ...      │
└──────────────────────┬───────────────────────────────────────┘
                       │ subscribe (wildcard)
                       ▼
            ┌────────────────────────┐
            │ SseDispatcherService   │  ← single point that converts
            │  - channel registry    │    internal events → SseEnvelope
            │  - per-user filtering  │    and pushes onto RxJS Subjects
            └────────────┬───────────┘
                         │ Subjects per channel
                         ▼
                ┌─────────────────┐
                │ SseController   │  @Sse() returns Observable<MessageEvent>
                └────────┬────────┘
                         │ HTTP/1.1 text/event-stream
                         ▼
                ┌─────────────────┐
                │  EventSource    │
                │   (browser)     │
                └─────────────────┘
```

Components:

- **`SseDispatcherService`** — application-scoped singleton. Subscribes to the
  internal bus once; owns four RxJS `Subject<SseEnvelope>` (one per channel).
  Per-user filtering happens **at subscribe time** in the controller, not here.
- **`SseController`** — translates a request into an `Observable<MessageEvent>`.
  Merges relevant subjects, prepends `hello`, interleaves `heartbeat$`,
  unsubscribes on client disconnect.
- **`ActiveUserRegistry`** — small `Map<userId, refCount>`. Incremented when a
  user opens a per-user stream, decremented on disconnect. **Exposed for the
  Wallet Projection Service** so it only recomputes for live users (avoids
  hammering the DB every price tick for offline users).

---

## 7. Module Layout

```
src/modules/realtime/
  realtime.module.ts
  sse.controller.ts
  sse.dispatcher.service.ts
  active-user.registry.ts
  dto/
    sse-envelope.dto.ts
```

`RealtimeModule` exports `ActiveUserRegistry` so `WalletModule` can inject it.
No other exports — the dispatcher and controller are internal.

---

## 8. Key Implementation Notes

### Wildcard subscription, single bridge
`EventEmitter2` is already configured with `wildcard: true` in `AppModule`.
`SseDispatcherService` subscribes once with `eventEmitter.onAny(...)` and
routes by event name. This keeps the bridge in one place — adding a new event
later is a one-line `switch` case, not a new listener.

### Backpressure
RxJS `Subject` is fire-and-forget. If a slow client falls behind, Node's TCP
write buffer absorbs short bursts; we don't queue per-client. Acceptable for
hackathon scale (≤ a few hundred connections). Document trade-off here, don't
build a queue.

### Heartbeat
`interval(15_000)` mapped to a comment line:
```ts
{ data: ': ping', type: 'comment' as never }
```
Or write a custom `MessageEvent` with no `data` and rely on `\n` keep-alive —
either works in browsers. **Pick one and stick with it.**

### Disconnect handling
NestJS auto-unsubscribes when the returned `Observable` completes. Use
`finalize(() => activeUsers.release(userId))` to keep the registry consistent.

### Validation
- `userId` query: `class-validator` `@IsUUID()` on a tiny query DTO.
- Reject with `400` if missing on per-user endpoints (allow it on `/sse/prices`).

### Error frames
On internal handler error inside the dispatcher, emit a `system` envelope with
`type: 'error'` and a generic message. **Never leak stack traces** over SSE.

### CORS
Add the frontend origin to `app.enableCors({ ... })`. SSE is a normal HTTP GET,
so default CORS rules apply — no preflight quirks unless we add custom headers.

### Encoding
Use `JsonHelper.replaceBigInts(...)` (already exists) before `JSON.stringify`.
Money fields go out as major-unit decimal strings.

---

## 9. Security

| Risk                                 | Mitigation                                                             |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Spoofed `userId` in query string     | **Accepted for hackathon.** Documented in code header + this doc.      |
| PII / cross-user leakage             | Per-user filtering happens server-side in the dispatcher subscription. |
| Connection exhaustion (DoS)          | Cap `max-connections-per-IP` at the ingress later; not in app now.     |
| Sensitive errors over the wire       | Generic `system.error` envelope; full error logged server-side.        |
| Token in URL (when we add JWT later) | Switch to `Authorization` header via a fetch-based polyfill, or short-lived signed query token. |

**TODO when auth lands:** replace `?userId=` with a JWT guard that derives
`userId` from the verified principal. Tracked separately.

---

## 10. Testing

### Manual (curl)
```powershell
curl.exe -N "http://localhost:5001/api/v1/sse/prices"
curl.exe -N "http://localhost:5001/api/v1/sse/stream?userId=<uid>"
```
Then in another terminal trigger a `simulate-transaction` and watch the second
stream produce `transactions` + `wallet` envelopes.

### Browser (smoke)
```js
const es = new EventSource('/api/v1/sse/stream?userId=' + uid);
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Unit
- `SseDispatcherService.spec.ts`: emit each internal event on a stub
  `EventEmitter2`, assert the right channel subject receives the right
  envelope with the right `userId`.
- `ActiveUserRegistry.spec.ts`: acquire/release/refCount semantics.

### Integration
- Spin Nest test module, open `Observable` from controller method directly,
  emit one event of each type, assert envelopes via `firstValueFrom(stream$.pipe(take(N)))`.
- No E2E HTTP test needed for hackathon; manual curl covers it.

---

## 11. Operational Notes

- **Container Apps**: ingress idle timeout defaults to 240s. Heartbeat at 15s
  is well under that.
- **Single replica only.** Scaling > 1 replica without Redis pub/sub will
  cause inconsistent fan-out (clients only see events from the replica they
  hit). Set `minReplicas = maxReplicas = 1` in `infra/container-app.bicep`
  until pub/sub is added.
- **Logging**: log connect/disconnect at `debug`, dispatch errors at `error`.
  Do **not** log every event — too noisy.

---

## 12. Implementation Checklist

- [ ] Create `src/modules/realtime/` skeleton (4 files listed in §7).
- [ ] Implement `SseEnvelope` DTO + serializer using `JsonHelper`.
- [ ] Implement `ActiveUserRegistry` (Map + acquire/release/has).
- [ ] Implement `SseDispatcherService` with `onAny` subscription + 4 Subjects + per-event mapping.
- [ ] Implement `SseController` with three endpoints, `hello` priming, heartbeat, `finalize` cleanup.
- [ ] Add `@IsUUID` query DTO + global `ValidationPipe` already present.
- [ ] Register `RealtimeModule` in `AppModule`.
- [ ] Export `ActiveUserRegistry`; inject into `WalletProjectionService` (separate ticket).
- [ ] Cap `infra/container-app.bicep` to 1 replica with comment.
- [ ] Update `README.md` with SSE endpoints + curl examples.
- [ ] Lint + build green.

---

## 13. Open Questions

- Wallet payload shape: include `perAsset` breakdown on every wallet event, or
  only on `wallet.balance_reconciled` and let trade events carry just the diff?
  Default = include `perAsset` always (simpler client).
- Do we want a `replay=last` query (send last cached envelope per channel) for
  reconnect? Default = **no** — frontend re-fetches via REST on reconnect.
