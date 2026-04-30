import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetClass, Currency } from '../../../common/enums';

export enum TradeType {
  BUY = 'BUY',
  SELL = 'SELL',
}

export class TradeRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsEnum(AssetClass)
  ticker: AssetClass;

  @IsNotEmpty()
  @IsEnum(TradeType)
  type: TradeType;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(
        `Invalid quantity ${value} - Failed to convert to BigInt`,
      );
    }
  })
  quantity: bigint;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(
        `Invalid totalCost ${value} - Failed to convert to BigInt`,
      );
    }
  })
  totalCost: bigint;

  @IsNotEmpty()
  @IsEnum(Currency)
  currency: Currency;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;
}

export class TradeResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  tradeId?: string;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid amount ${value} - Failed to convert to BigInt`);
    }
  })
  executedQuantity?: bigint;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid amount ${value} - Failed to convert to BigInt`);
    }
  })
  amount: bigint;
  executionPrice?: bigint;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid amount ${value} - Failed to convert to BigInt`);
    }
  })
  finalTotalCost?: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
