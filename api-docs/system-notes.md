# System Notes

Technical reference for developers working on the Tantaropic backend. Covers key patterns, precision strategies, and design decisions.

---

## Money Handling — The "Oreo Cookie" Pattern

All financial data flows through three layers:

```
API (numbers) → Domain (Money VO) → Database (BigInt)
```

### Layer 1: API / DTOs

External inputs arrive as plain `number` values in major units (e.g., `4.30` EGP). DTOs use `number` types.

### Layer 2: Domain Logic

Business logic exclusively uses the `Money` Value Object (`src/common/domain/value-objects/money.vo.ts`). Key features:

- **Immutable**: All math returns new instances
- **Currency-safe**: Cannot add EGP to USD
- **Underflow-protected**: `subtract()` throws if result would be negative
- **Factory methods**: `Money.fromMajorUnit(4.30, Currency.EGP)` and `Money.fromMinorUnit(430n, Currency.EGP)`

### Layer 3: Database / Prisma

Values are stored as `BigInt` in the smallest currency unit (piasters for EGP). No decimals in the database. The repository layer handles wrap/unwrap:

- **Save**: `money.toDatabaseValue()` → `{ amount: BigInt, currency: string }`
- **Read**: `Money.fromMinorUnit(row.amount, row.currency)` → `Money`

### Rule

Never perform arithmetic on raw numbers or BigInts outside the `Money` VO. Use `money.add()`, `money.subtract()`.

---

## Currency System

Currencies are defined in the `CurrencyRegistry` (`src/common/constants/currency.registry.ts`):

| Currency | Multiplier | Major Unit | Minor Unit |
| -------- | ---------- | ---------- | ---------- |
| EGP      | 100        | Pound      | Piaster    |

To convert: `4.30 EGP × 100 = 430 piasters`

---

## Asset Unit Precision

Fractional asset ownership is handled using a fixed-point multiplier:

```
ASSET_UNIT_PRECISION = 100,000,000 (1e8)
```

This means:

- `1 gram of gold = 100,000,000 internal units`
- `0.001 grams = 100,000 internal units`
- Database field `WalletPosition.totalUnits` stores internal units as `BigInt`

### Why 1e8?

Matches the original `Decimal(18, 8)` precision from the schema design phase. Provides 8 decimal places of precision for asset quantities.

### Conversion Reference

| Direction          | Formula                                            |
| ------------------ | -------------------------------------------------- |
| EGP → units (buy)  | `units = amountInPiasters × 1e8 / priceInPiasters` |
| Units → EGP (sell) | `proceeds = units × priceInPiasters / 1e8`         |

---

## Idempotency Strategy

All mock API operations that modify state use **caller-provided idempotency keys**.

### How It Works

1. Caller includes an `idempotencyKey` in the request body
2. Service checks an in-memory `Map<string, Response>`
3. If key exists → return stored response (no side effects)
4. If key is new → execute operation, store response, return it

### Which Endpoints Use Idempotency

| Endpoint               | Idempotent | Reason                                            |
| ---------------------- | ---------- | ------------------------------------------------- |
| `simulate-transaction` | No         | Each call intentionally creates a new transaction |
| `collect-funds`        | Yes        | Prevents double-collection of the same sweep      |
| `deposit-funds`        | Yes        | Prevents double-deposit during redemption         |
| `buy`                  | Yes        | Prevents double-purchase of the same allocation   |
| `sell`                 | Yes        | Prevents double-sale of the same redemption       |
| `set-prices`           | No         | Admin override, always applies                    |

### Key Format Convention

Use a descriptive prefix tied to the operation:

```
sweep-{transactionEventId}
alloc-{assetClass}-{transactionEventId}
redeem-{assetClass}-{redemptionId}
```

---

## Rates and Allocation

All platform rates use **Basis Points** (BPS), where `100 BPS = 1%`:

### Fund Fees

| AUM Tier          | Fee (BPS) | Fee (%) |
| ----------------- | --------- | ------- |
| Up to 1,000 EGP   | 50        | 0.5%    |
| Up to 10,000 EGP  | 40        | 0.4%    |
| Up to 100,000 EGP | 30        | 0.3%    |

### Profit Fees

| Profit Tier         | Fee (BPS) | Fee (%) |
| ------------------- | --------- | ------- |
| Up to 10,000 EGP    | 150       | 1.5%    |
| Up to 100,000 EGP   | 140       | 1.4%    |
| Up to 1,000,000 EGP | 130       | 1.3%    |

### Asset Allocation (Default Profile)

| Asset Class | BPS       | Percentage |
| ----------- | --------- | ---------- |
| Gold        | 2400      | 24%        |
| Index Fund  | 7500      | 75%        |
| High-Risk   | 100       | 1%         |
| **Total**   | **10000** | **100%**   |

---

## Mock API Response Format

Mock APIs return **raw response objects** instead of the standard `ok()` envelope used by internal endpoints. This is intentional — they simulate external third-party services that would not follow our internal API contract.

Internal system endpoints (Users, Webhook, etc.) use the standard response envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed"
}
```

---

## Concurrency Control

The `DigitalWallet` model uses **Optimistic Concurrency Control (OCC)** via a `version` column:

1. Read wallet with current `version`
2. Perform calculations
3. Update with `WHERE id = :id AND version = :currentVersion`
4. If `updateCount === 0` → concurrency conflict, retry or throw

This prevents race conditions during simultaneous sweeps or trades without database-level locks.
