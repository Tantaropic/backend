import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { RiskProfile } from '../../../common/enums';
import type { User } from '@prisma/client';

export class CreateUserForProfileDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  profileId: string;

  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;
}

export class CreateUserForProfileResponseDto implements Partial<User> {
  @IsUUID()
  id: string;

  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsUUID()
  profileId: string;

  @IsEnum(RiskProfile)
  riskProfile: RiskProfile;
}
