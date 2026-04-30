import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { Currency } from '../../../common/enums';
import { Transform } from 'class-transformer';

export class FundTransferRequestDto {
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
  idempotencyKey: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  accountId?: string;
}

export class FundTransferResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  amount?: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
