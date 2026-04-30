import { AssetClass, Currency } from '../../../common/enums';

export interface BuyAssetDto {
  assetClass: AssetClass;
  amount: bigint;
  currency: Currency;
  idempotencyKey: string;
}
