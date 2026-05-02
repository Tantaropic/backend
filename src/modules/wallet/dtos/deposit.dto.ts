import { IsNotEmpty, IsString } from 'class-validator';
import { BadRequestException } from 'node_modules/@nestjs/common';
import { Transform } from 'class-transformer';

/**
 * DTO for the manual deposit (top-up) endpoint.
 * Amount is in major units (e.g., 50 EGP) — the service converts to minor.
 */
export class DepositRequestDto {
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
}
