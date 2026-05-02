import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { AssetClass } from '@prisma/client';
import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

/**
 * DTO for the redemption (sell) endpoint.
 * The user sells all or a portion of a specific asset class.
 * `units` is the number of internal asset units (1e8 precision) to sell.
 */
export class RedeemRequestDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(AssetClass)
  assetClass: AssetClass;

  /**
   * Number of internal asset units to sell (BigInt as string from API).
   * e.g. "155555" = 0.00155555 real units at 1e8 precision.
   */
  @IsOptional()
  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      return BigInt(String(value));
    } catch {
      throw new BadRequestException('Invalid units');
    }
  })
  units: bigint;
}
