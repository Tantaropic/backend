import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Currency } from '../../../common/enums';
import { MerchantTag } from '../../../common/interfaces/bank-provider.interface';
import { Transform } from 'class-transformer';

export class TransactionWebhookRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  transactionId: string;

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
  @IsDateString()
  occurredAt: string;

  @IsNotEmpty()
  @IsString()
  merchantTag: MerchantTag;
}

export class TransactionWebhookResponseDto {
  @IsBoolean()
  success: boolean;

  @IsNotEmpty()
  @IsString()
  transactionId: string;
}
