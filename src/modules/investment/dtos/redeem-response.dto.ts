import { AssetClass } from '../../../common/enums';

/**
 * Response DTO for POST /api/v1/investment/redeem
 *
 * All monetary amounts are returned as strings (minor-unit piasters) to avoid
 * JSON number precision loss with large BigInt values.
 */
export class RedeemResponseDto {
  /** Unique transaction identifier for this redemption. */
  transactionId: string;

  /** Total proceeds from the sale before profit fee, in minor units. */
  grossProceeds: string;

  /** Profit fee charged on the gain (0 if sold at a loss), in minor units. */
  profitFee: string;

  /** Net amount credited to the user's fiat wallet after profit fee, in minor units. */
  netCredited: string;

  /** The asset class that was sold. */
  assetClass: AssetClass;

  /** Actual number of units sold, in ASSET_UNIT_PRECISION scale. */
  unitsSold: string;
}
