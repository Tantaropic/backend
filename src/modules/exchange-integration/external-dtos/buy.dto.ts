import { IsNotEmpty, IsEnum, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetClass, Currency } from '../../../common/enums';

export class BuyAssetRequestDto {
  @IsNotEmpty()
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid amount ${value} - Failed to convert to BigInt`);
    }
  })
  amount: bigint;

  @IsNotEmpty()
  @IsEnum(Currency)
  currency: Currency;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;
}
