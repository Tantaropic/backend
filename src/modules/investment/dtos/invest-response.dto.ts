/**
 * Response DTO for POST /api/v1/investment/invest
 *
 * The endpoint is 202 Accepted — allocation runs asynchronously after the debit.
 * All monetary amounts are returned as strings (minor-unit piasters) to avoid
 * JSON number precision loss with large BigInt values.
 */
export class InvestResponseDto {
  /** Always true — confirms the investment was accepted into the pipeline. */
  queued: boolean;

  /** Gross amount debited from the wallet, in minor units (piasters). */
  grossAmount: string;

  /** The client-supplied idempotency key echoed back for reconciliation. */
  idempotencyKey: string;
}
