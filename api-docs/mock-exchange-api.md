# MockExchangeAPI

Simulates an external market/exchange API. Provides current asset prices and executes mock buy/sell trades with fractional unit support.

**Base URL:** `/mock-exchange`

---

## Understanding Units and Precision

All asset quantities use a fixed-point multiplier to support fractional ownership:

```
1 real unit (e.g. 1 gram of gold) = 100,000,000 internal units
```

This is defined as `ASSET_UNIT_PRECISION = 1e8` and mirrors the precision of `Decimal(18, 8)`.

### Example

A purchase of 0.70 EGP of Gold (priced at 450 EGP/gram):

```
70 piasters × 100,000,000 / 45,000 piasters = 155,555 internal units
155,555 / 100,000,000 = 0.00155555 grams of gold
```

This means the investor now owns 0.00155555 grams. The value `155555` is what gets stored as `BigInt` in `WalletPosition.totalUnits`.

### Prices

All prices are in the **smallest currency unit** (piasters for EGP):

| Asset | Display Price | Stored Price |
|-------|--------------|-------------|
| Gold | 450.00 EGP/gram | `45000` piasters |
| Index Fund | 120.00 EGP/share | `12000` piasters |
| High-Risk | 85.00 EGP/share | `8500` piasters |

---

## GET /mock-exchange/prices

Returns current market prices for all tradeable asset classes.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `assetClass` | `string` | No | Filter by asset class: `GOLD`, `INDEX_FUND`, or `HIGH_RISK` |

### Example Request

```
GET /mock-exchange/prices
GET /mock-exchange/prices?assetClass=GOLD
```

### Example Response

```json
{
  "prices": [
    {
      "assetClass": "GOLD",
      "pricePerUnit": 45000,
      "currency": "EGP",
      "updatedAt": "2026-04-29T14:30:00.000Z"
    },
    {
      "assetClass": "INDEX_FUND",
      "pricePerUnit": 12000,
      "currency": "EGP",
      "updatedAt": "2026-04-29T14:30:00.000Z"
    },
    {
      "assetClass": "HIGH_RISK",
      "pricePerUnit": 8500,
      "currency": "EGP",
      "updatedAt": "2026-04-29T14:30:00.000Z"
    }
  ]
}
```

### Notes

- `pricePerUnit` is in **piasters** (smallest currency unit), not EGP
- Prices are static on startup and can be changed via the `set-prices` admin endpoint

---

## POST /mock-exchange/buy

Executes a mock buy order. Converts the spend amount into fractional internal units.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetClass` | `string` | Yes | One of: `GOLD`, `INDEX_FUND`, `HIGH_RISK` |
| `amount` | `number` | Yes | Amount to spend in **major units** (EGP) |
| `currency` | `string` | Yes | Currency code: `"EGP"` |
| `idempotencyKey` | `string` | Yes | Unique key to prevent duplicate trades |

### Example Request

```json
POST /mock-exchange/buy

{
  "assetClass": "GOLD",
  "amount": 0.70,
  "currency": "EGP",
  "idempotencyKey": "alloc-gold-f47ac10b"
}
```

### Example Response

```json
{
  "success": true,
  "tradeId": "d83a1b2c-4e5f-6789-0abc-def123456789",
  "assetClass": "GOLD",
  "units": 155555,
  "executionPrice": 45000,
  "totalAmount": 69
}
```

### Response Fields

| Field | Description |
|-------|-------------|
| `units` | Number of internal units acquired (divide by 1e8 for real units) |
| `executionPrice` | Price per real unit in piasters at time of trade |
| `totalAmount` | Actual cost in piasters (may be ≤ 1 piaster less than input due to rounding) |

### Calculation

```
amountInPiasters = round(amount × 100)
units = floor(amountInPiasters × ASSET_UNIT_PRECISION / pricePerUnit)
totalCost = floor(units × pricePerUnit / ASSET_UNIT_PRECISION)
```

All intermediate arithmetic uses `BigInt` to prevent overflow for large amounts.

### Idempotency

Duplicate `idempotencyKey` returns the original trade response without executing a new trade.

---

## POST /mock-exchange/sell

Executes a mock sell order. Converts internal units back into currency.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetClass` | `string` | Yes | One of: `GOLD`, `INDEX_FUND`, `HIGH_RISK` |
| `units` | `number` | Yes | Number of **internal units** to sell |
| `idempotencyKey` | `string` | Yes | Unique key to prevent duplicate trades |

### Example Request

```json
POST /mock-exchange/sell

{
  "assetClass": "GOLD",
  "units": 155555,
  "idempotencyKey": "redeem-gold-b21e5c7a"
}
```

### Example Response

```json
{
  "success": true,
  "tradeId": "e94b2c3d-5f60-7890-1bcd-ef2345678901",
  "assetClass": "GOLD",
  "units": 155555,
  "executionPrice": 45000,
  "totalAmount": 69
}
```

### Calculation

```
totalProceeds = floor(units × pricePerUnit / ASSET_UNIT_PRECISION)
```

### Roundtrip Precision

Buying and selling the same units at the same price results in a maximum loss of **1 piaster** due to integer division rounding. This is by design — the system never credits more than was paid.

### Idempotency

Same behavior as `buy`. Duplicate `idempotencyKey` returns the stored response.

---

## POST /mock-exchange/set-prices

Admin endpoint to manually update asset prices. Used for demo purposes and time-travel simulation.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetClass` | `string` | Yes | One of: `GOLD`, `INDEX_FUND`, `HIGH_RISK` |
| `pricePerUnit` | `number` | Yes | New price in **piasters** (smallest currency unit) |

### Example Request

```json
POST /mock-exchange/set-prices

{
  "assetClass": "GOLD",
  "pricePerUnit": 50000
}
```

### Example Response

```json
{
  "success": true
}
```

### Notes

- This changes the in-memory price immediately
- All subsequent `buy`, `sell`, and `prices` calls will use the updated price
- No idempotency — each call overwrites the previous price
