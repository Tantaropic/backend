# MockBankAPI

Simulates an external Open Banking API. This service generates mock transactions, collects round-up funds, and handles deposit-back operations.

**Base URL:** `/mock-bank`

---

## POST /mock-bank/simulate-transaction

Simulates a user making a purchase at a merchant. Generates a random transaction and delivers it to the system's webhook endpoint via HTTP.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | Yes | The user who made the purchase |
| `amount` | `number` | No | Purchase amount in EGP (major units). If omitted, a random amount between 1–500 EGP is generated |
| `merchantTag` | `string` | No | Merchant category. If omitted, a random tag is picked from the curated list |

### Available Merchant Tags

`coffee_shop`, `restaurant`, `grocery`, `gas_station`, `pharmacy`, `clothing`, `electronics`, `online_shopping`, `food_delivery`, `ride_share`, `cigarettes`, `fast_food`, `vape_shop`, `entertainment`, `gym`

Tags like `cigarettes`, `fast_food`, and `vape_shop` are designed to trigger AI spending insights.

### Example Request

```json
POST /mock-bank/simulate-transaction

{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": 4.30,
  "merchantTag": "coffee_shop"
}
```

### Example Response

```json
{
  "success": true,
  "bankTransactionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "merchantTag": "coffee_shop",
  "amount": 4.30,
  "currency": "EGP",
  "occurredAt": "2026-04-29T14:30:00.000Z"
}
```

### Behavior

1. Generates a unique `bankTransactionId` (UUID)
2. Builds a webhook payload with transaction details
3. Makes an HTTP POST to `http://localhost:{PORT}/webhook/transaction`
4. Returns the generated transaction details regardless of webhook delivery status
5. If the webhook endpoint is not yet available, a warning is logged but the response still succeeds

### Notes

- This endpoint does **not** use idempotency because each call intentionally creates a new transaction
- The webhook delivery is fire-and-forget from the bank's perspective
- The `amount` in the response is in **major units** (EGP), not piasters

---

## POST /mock-bank/collect-funds

Simulates collecting round-up funds from the user's bank account. Called by the Sweep Engine after calculating the round-up amount.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bankTransactionId` | `string` | Yes | Reference to the original transaction |
| `userId` | `string` | Yes | The user whose funds are being collected |
| `amount` | `number` | Yes | Amount to collect in major units |
| `currency` | `string` | Yes | Currency code (e.g. `"EGP"`) |
| `idempotencyKey` | `string` | Yes | Unique key to prevent duplicate collections |

### Example Request

```json
POST /mock-bank/collect-funds

{
  "bankTransactionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": 0.70,
  "currency": "EGP",
  "idempotencyKey": "sweep-f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

### Example Response

```json
{
  "success": true,
  "operationId": "b21e5c7a-9f3d-4a1b-8c2e-1234567890ab",
  "message": "Collected 0.7 EGP from user a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Idempotency

Duplicate requests with the same `idempotencyKey` return the original stored response without creating a new operation.

---

## POST /mock-bank/deposit-funds

Simulates depositing money back to the user's bank account during a withdrawal (redemption). Called by the Redemption Handler after liquidating assets.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | Yes | The user receiving the deposit |
| `amount` | `number` | Yes | Amount to deposit in major units |
| `currency` | `string` | Yes | Currency code (e.g. `"EGP"`) |
| `idempotencyKey` | `string` | Yes | Unique key to prevent duplicate deposits |

### Example Request

```json
POST /mock-bank/deposit-funds

{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": 197.04,
  "currency": "EGP",
  "idempotencyKey": "redeem-b21e5c7a-9f3d-4a1b-8c2e-1234567890ab"
}
```

### Example Response

```json
{
  "success": true,
  "operationId": "c32f6d8b-0e4a-5b2c-9d3f-2345678901bc",
  "message": "Deposited 197.04 EGP to user a1b2c3d4-e5f6-7890-abcd-ef1234567890's bank"
}
```

### Idempotency

Same behavior as `collect-funds`. Duplicate `idempotencyKey` returns the stored response.
