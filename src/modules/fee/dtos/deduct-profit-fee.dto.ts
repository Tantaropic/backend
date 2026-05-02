import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { IsBigInt } from '../../../common/validators/is-bigint.validator';
import { IsMoneyInstance } from '../../../common/validators/is-money.validator';
import { Money } from '../../../common/domain/value-objects/money.vo';

/** Params for FeeEngineService.deductProfitFeeOnRedemption */
export class DeductProfitFeeDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  walletId: string;

  @IsBigInt()
  /** Number of asset units sold (in ASSET_UNIT_PRECISION scale). */
  executedUnits: bigint;

  @IsMoneyInstance()
  /** Execution price per unit at which the asset was sold. */
  executionPrice: Money;

  @IsBigInt()
  /** WAC average buy price per unit (from WalletPosition). */
  averageBuyPrice: bigint;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
