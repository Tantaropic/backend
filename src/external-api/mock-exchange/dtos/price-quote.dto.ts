import { AssetClass, Currency } from '../../../common/enums';

export interface AssetPriceDto {
  assetClass: AssetClass;
  pricePerUnit: bigint;
  currency: Currency;
  updatedAt: string;
}

export interface PriceQuoteResponseDto {
  prices: {
    assetClass: AssetClass;
    pricePerUnit: string | bigint;
    currency: Currency;
    updatedAt: string;
  }[];
}

export interface PriceEntry {
  currPrice: bigint;
  updatedAt: Date;
  currency: Currency;
}
