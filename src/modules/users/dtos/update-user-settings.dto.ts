import { IsEnum, IsOptional } from 'class-validator';
import { RiskProfile } from '../../../common/enums';
import { Transform } from 'class-transformer';

/**
 * DTO for updating user-specific settings.
 * targetGoal is passed as a number from the API and converted to BigInt in the domain.
 */
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    try {
      return BigInt(String(value));
    } catch {
      return undefined;
    }
  })
  targetGoal?: bigint;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    try {
      return BigInt(String(value));
    } catch {
      return undefined;
    }
  })
  roundUpStep?: bigint;
}
