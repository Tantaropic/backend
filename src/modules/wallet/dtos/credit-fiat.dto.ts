import { IsNotEmpty, IsString, IsUUID, IsEnum } from 'class-validator';
import { IsMoneyInstance } from '../../../common/validators/is-money.validator';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { LedgerEntryType } from '../../../common/enums';

/** Params for WalletService.creditFiat */
export class CreditFiatDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  walletId: string;

  @IsMoneyInstance()
  amount: Money;

  @IsEnum(LedgerEntryType)
  ledgerType: LedgerEntryType;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsString()
  note?: string;
}
