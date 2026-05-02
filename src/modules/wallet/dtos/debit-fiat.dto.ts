import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { IsMoneyInstance } from '../../../common/validators/is-money.validator';
import { Money } from '../../../common/domain/value-objects/money.vo';

/** Params for WalletService.debitFiat */
export class DebitFiatDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  walletId: string;

  @IsMoneyInstance()
  amount: Money;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsString()
  note?: string;
}
