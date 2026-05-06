import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

function toOptionalBigInt(value: unknown, label: string): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const normalized =
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'number'
        ? value.toString()
        : typeof value === 'string'
          ? value.trim()
          : undefined;
  if (!normalized) {
    throw new BadRequestException(`${label} must be a valid amount`);
  }
  try {
    return BigInt(normalized);
  } catch {
    throw new BadRequestException(`${label} must be a valid amount`);
  }
}

export class CreateGoalDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsNotEmpty()
  @Transform(({ value }) => toOptionalBigInt(value, 'Target amount'))
  targetAmount!: bigint;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBigInt(value, 'Monthly roundup'))
  monthlyRoundup?: bigint;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBigInt(value, 'Target amount'))
  targetAmount?: bigint;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalBigInt(value, 'Monthly roundup'))
  monthlyRoundup?: bigint;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
