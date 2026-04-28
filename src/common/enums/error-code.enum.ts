/**
 * Machine-readable error codes returned in `IApiErrorResponse.errorCode`.
 * Add new codes here as the project grows; never use raw strings in the filter.
 */
export enum ErrorCode {
  // ─── HTTP ────────────────────────────────────────────────────────────────
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',

  // ─── Validation ───────────────────────────────────────────────────────────
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // ─── Business Logic ───────────────────────────────────────────────────────
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',

  // ─── Database ─────────────────────────────────────────────────────────────
  DB_RECORD_NOT_FOUND = 'DB_RECORD_NOT_FOUND',
  DB_UNIQUE_CONSTRAINT = 'DB_UNIQUE_CONSTRAINT',
  DB_FOREIGN_KEY_CONSTRAINT = 'DB_FOREIGN_KEY_CONSTRAINT',

  // ─── Server ───────────────────────────────────────────────────────────────
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
