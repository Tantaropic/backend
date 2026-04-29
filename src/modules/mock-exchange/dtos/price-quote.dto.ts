import { AssetClass, Currency } from '../../../common/enums';

export interface AssetPriceDto {
  assetClass: AssetClass;
  pricePerUnit: number;
  currency: Currency;
  updatedAt: string;
}

export interface PriceQuoteResponseDto {
  prices: AssetPriceDto[];
}
