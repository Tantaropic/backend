import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { IsMoneyInstance } from '../../../common/validators/is-money.validator';
import { Money } from '../../../common/domain/value-objects/money.vo';

/** Params for InvestmentService.investAmount */
export class InvestAmountDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsMoneyInstance()
  /** Gross fiat amount to invest (in minor units, domain Money object). */
  grossAmount: Money;

  @IsString()
  @IsNotEmpty()
  /** Client-supplied idempotency key — forwarded through the entire async pipeline. */
  idempotencyKey: string;
}
