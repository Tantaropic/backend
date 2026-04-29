import { AssetClass } from '../../../common/enums';

export interface SellAssetDto {
  assetClass: AssetClass;
  units: number;
  idempotencyKey: string;
}
