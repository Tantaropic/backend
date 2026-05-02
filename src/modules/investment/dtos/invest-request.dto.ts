import { IsNotEmpty, IsString } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';

/**
 * DTO for the manual invest endpoint.
 * The amount is passed as a string (piasters / minor units) and transformed to BigInt.
 */
export class InvestRequestDto {
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
      throw new BadRequestException(
        'Invalid amount: must be a positive integer (minor units)',
      );
    }
  })
  /** Gross amount to invest, in minor units (piasters). */
  amount: bigint;

  @IsString()
  @IsNotEmpty()
  /** Client-generated idempotency key to make the request safe to retry. */
  idempotencyKey: string;
}
