/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSE CONTRACT
 * Every endpoint in this project returns one of these two shapes.
 * The `success` field is a **literal boolean discriminant** so callers can
 * narrow the type with a simple `if (response.success)` guard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Success Envelope ────────────────────────────────────────────────────────

export interface IApiResponse<T = null> {
  /** Always `true` for a success response. */
  success: true;
  statusCode: number;
  message: string;
  /** Generic payload — use `null` when there is no body (e.g. 204-style). */
  data: T;
  /** ISO-8601 server timestamp. */
  timestamp: string;
  /** Optional correlation id injected from the request. */
  requestId?: string;
  /** The route that was called, stripped of query-string. */
  path?: string;
}

// ─── Error Envelope ──────────────────────────────────────────────────────────

export interface IApiErrorResponse {
  /** Always `false` for an error response. */
  success: false;
  statusCode: number;
  /**
   * Machine-readable error code.
   * Maps to an `ErrorCode` enum entry (e.g. `"VALIDATION_ERROR"`).
   */
  errorCode: string;
  /**
   * Human-readable summary of the error.
   * For validation failures this is `"Validation failed"`.
   */
  message: string;
  /**
   * Per-field validation messages **or** a single-element array
   * when the error is not field-specific.
   */
  errors: string[];
  timestamp: string;
  /** The route that was called, stripped of query-string. */
  path?: string;
  requestId?: string;
}

export type ApiEnvelope<T = null> = IApiResponse<T> | IApiErrorResponse;
