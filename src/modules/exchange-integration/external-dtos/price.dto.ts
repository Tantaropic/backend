import { IsNotEmpty, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AssetClass, Currency } from '../../../common/enums';

export class SetPriceRequestDto {
  @IsNotEmpty()
  @IsEnum(AssetClass)
  ticker: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid price ${value} - Failed to convert to BigInt`);
    }
  })
  price: bigint;

  @IsNotEmpty()
  @IsEnum(Currency)
  currency: Currency;
}

export class AssetPriceDto {
  @IsNotEmpty()
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid price ${value} - Failed to convert to BigInt`);
    }
  })
  pricePerUnit: bigint;

  @IsNotEmpty()
  @IsEnum(Currency)
  currency: Currency;

  @IsNotEmpty()
  updatedAt: string;
}

export class PriceQuoteResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetPriceDto)
  prices: AssetPriceDto[];
}
