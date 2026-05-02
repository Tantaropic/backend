import { IsNotEmpty, IsString, IsUUID, IsEnum } from 'class-validator';
import { IsBigInt } from '../../../common/validators/is-bigint.validator';
import { AssetClass } from '../../../common/enums';

/** Params for InvestmentService.sellAsset */
export class SellAssetDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  walletId: string;

  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsBigInt()
  /** Number of units to sell (in ASSET_UNIT_PRECISION scale). */
  units: bigint;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
