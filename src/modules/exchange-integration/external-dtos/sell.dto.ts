import { IsNotEmpty, IsEnum, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetClass } from '../../../common/enums';

export class SellAssetRequestDto {
  @IsNotEmpty()
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid units ${value} - Failed to convert to BigInt`);
    }
  })
  units: bigint;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;
}
