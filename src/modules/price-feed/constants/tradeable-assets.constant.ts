import { AssetClass } from '../../../common/enums';

/**
 * The full set of asset classes the Price Feed polls every tick.
 * Order is stable for log readability and test snapshots.
 */
export const TRADEABLE_ASSETS: readonly AssetClass[] = [
  AssetClass.GOLD,
  AssetClass.INDEX_FUND,
  AssetClass.HIGH_RISK,
];
