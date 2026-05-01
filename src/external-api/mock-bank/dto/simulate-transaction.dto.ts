import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { Currency } from '../../../common/enums';
import { MerchantTag } from '../../../common/interfaces/bank-provider.interface';
import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export class SimulateTransactionRequestDto {
  @IsOptional()
  @IsString()
  userId: string;

  @IsOptional()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new BadRequestException(
        `Invalid amount ${value} - Failed to convert to BigInt`,
      );
    }
  })
  amount: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency: Currency;

  @IsOptional()
  @IsString()
  merchantTag: MerchantTag;

  @IsOptional()
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

  @IsOptional()
  amount?: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsBoolean()
  webhookDelivered?: boolean;
}
