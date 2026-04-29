import { AssetClass, Currency } from '../../../common/enums';

export interface BuyAssetDto {
  assetClass: AssetClass;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
}
