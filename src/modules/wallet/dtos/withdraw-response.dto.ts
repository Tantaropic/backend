/**
 * Response DTO for POST /api/v1/wallet/withdraw
 *
 * Confirms the fiat amount debited and bank transfer initiated.
 * Monetary amounts are strings to prevent JSON BigInt precision loss.
 */
export class WithdrawResponseDto {
  /** Unique transaction identifier for this withdrawal. */
  transactionId: string;

  /** Human-readable confirmation of the amount and currency withdrawn. */
  withdrawn: string;
}
