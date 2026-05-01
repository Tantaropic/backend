import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO for creating a new profile, wallet, and initial user.
 */
export class CreateProfileDto {
  @IsString()
  @MinLength(3)
  profileName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  userName: string;
}
