import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AssetClass } from '../../../common/enums';
import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';

export class SellAssetDto {
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new BadRequestException('Invalid units');
    }
  })
  units: bigint;

  @IsString()
  idempotencyKey: string;
}
