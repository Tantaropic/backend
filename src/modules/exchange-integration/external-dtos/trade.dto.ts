import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetClass } from '../../../common/enums';

export class TradeResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  message?: string;

  @IsNotEmpty()
  @IsString()
  tradeId: string;

  @IsNotEmpty()
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(`Invalid units ${value} - Failed to convert to BigInt`);
    }
  })
  units: bigint;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(
        `Invalid executionPrice ${value} - Failed to convert to BigInt`,
      );
    }
  })
  executionPrice: bigint;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new Error(
        `Invalid totalAmount ${value} - Failed to convert to BigInt`,
      );
    }
  })
  totalAmount: bigint;
}
