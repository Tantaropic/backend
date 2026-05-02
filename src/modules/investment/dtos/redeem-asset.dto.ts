import { IsNotEmpty, IsUUID, IsEnum } from 'class-validator';
import { AssetClass } from '../../../common/enums';
import { BadRequestException } from 'node_modules/@nestjs/common';
import { Transform } from 'class-transformer';

/** Params for RedemptionOrchestratorService.redeemAsset */
export class RedeemAssetDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

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
}
