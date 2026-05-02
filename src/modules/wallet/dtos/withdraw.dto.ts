import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import type { Currency } from '../../../common/enums';

/**
 * DTO for the withdrawal endpoint.
 * Amount is in major units (e.g., 50 EGP) — the service converts to minor.
 * Transfers fiat balance from wallet to the user's external bank account.
 */
export class WithdrawRequestDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      const bigIntValue = BigInt(String(value));
      if (bigIntValue <= 0n) {
        throw new BadRequestException('Amount must be greater than 0');
      }
      return bigIntValue;
    } catch {
      throw new BadRequestException('Invalid amount');
    }
  })
  amount: bigint;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @IsOptional()
  currency?: Currency;
}
