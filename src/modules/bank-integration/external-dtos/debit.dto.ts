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
import { BadRequestException } from '@nestjs/common';

export class DebitRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
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

  @IsNotEmpty()
  @IsEnum(Currency)
  currency: Currency;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class DebitResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  @IsNotEmpty()
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
