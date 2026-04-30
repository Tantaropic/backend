import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Currency } from '../../../common/enums';
import { MerchantTag } from '../../../common/interfaces/bank-provider.interface';
import { Transform } from 'class-transformer';

export class SimulateTransactionRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

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
  merchantTag: MerchantTag;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;
}

export class SimulateTransactionResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid amount ${value} - Failed to convert to BigInt`);
    }
  })
  amount?: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
