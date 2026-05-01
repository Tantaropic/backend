import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { RiskProfile } from '../../../common/enums';

/**
 * DTO for updating user-specific settings.
 * targetGoal is passed as a number from the API and converted to BigInt in the domain.
 */
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetGoal?: number;
}
