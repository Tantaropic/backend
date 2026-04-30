import { IsNotEmpty, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetClass, Currency } from '../../../common/enums';

export class PriceResponseDto {
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
