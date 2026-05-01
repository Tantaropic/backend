import type { Money } from '../../../common/domain/value-objects/money.vo';

// ─── SSE Channel Types ──────────────────────────────────────────────────────

/** Frontend routing key — each channel maps to a UI widget. */
export type SseChannel =
  | 'transactions'
  | 'wallet'
  | 'ai-insights'
  | 'prices'
  | 'system';

// ─── SSE Envelope ────────────────────────────────────────────────────────────

/** Standard envelope wrapping every SSE event pushed to the client. */
export interface SseEnvelope {
  /** Which UI widget this event targets. */
  channel: SseChannel;

  /** The `SystemEventType` string value (e.g., `'wallet.funds_roundup'`). */
  type: string;

  /** Owner of the event. `null` for global broadcasts (prices). */
  userId: string | null;

  /** Payload — always JSON-safe (no BigInt, no class instances). */
  data: Record<string, unknown>;

  /** ISO 8601 timestamp. */
  ts: string;
}

// ─── Serialization Helpers ───────────────────────────────────────────────────

/**
 * Convert a Money VO to a plain, JSON-safe object.
 * @param money - The Money value object to serialize.
 * @returns `{ amount: string, currency: string }` with BigInt stringified.
 */
export function serializeMoney(money: Money): {
  amount: string;
  currency: string;
} {
  return {
    amount: money.amount.toString(),
    currency: money.currency,
  };
}

/**
 * Convert a BigInt to a JSON-safe string.
 * @param value - The BigInt to serialize.
 */
export function serializeBigInt(value: bigint): string {
  return value.toString();
}
