import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ok } from '../../common/helpers/response.helper';
import { JsonHelper } from '../../common/helpers';
import type { IApiResponse } from '../../common/dtos/response.dto';
import { CreateProfileDto } from './dtos/create-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /**
   * POST /profiles/create-random
   * Dev / demo endpoint — generates a random Profile + Wallet + User in one shot.
   */
  @Post('create-random')
  async createRandom(
    @Body() body: Partial<CreateProfileDto>,
  ): Promise<IApiResponse<any>> {
    const result = await this.profilesService.createRandomProfile(body);
    return ok(
      JsonHelper.replaceBigInts(result),
      'Random profile created successfully',
      201,
    );
  }

  /**
   * POST /profiles
   * Create a new family profile with an explicit payload.
   */
  @Post()
  async create(@Body() body: CreateProfileDto): Promise<IApiResponse<any>> {
    const result = await this.profilesService.createProfile(body);
    return ok(
      JsonHelper.replaceBigInts(result),
      'Profile created successfully',
      201,
    );
  }

  /**
   * GET /profiles
   * List all profiles.
   */
  @Get()
  async getAll(): Promise<IApiResponse<any>> {
    const profiles = await this.profilesService.getAllProfiles();
    return ok(
      JsonHelper.replaceBigInts(profiles),
      'Profiles retrieved successfully',
    );
  }

  /**
   * GET /profiles/:id
   * Full profile snapshot — users + wallet + positions.
   */
  @Get(':id')
  async getFull(@Param('id') id: string): Promise<IApiResponse<any>> {
    const profile = await this.profilesService.getProfileFull(id);
    return ok(
      JsonHelper.replaceBigInts(profile),
      'Profile retrieved successfully',
    );
  }

  /**
   * GET /profiles/:id/wallet
   * Profile wallet and asset positions only.
   */
  @Get(':id/wallet')
  async getWallet(@Param('id') id: string): Promise<IApiResponse<any>> {
    const profile = await this.profilesService.getProfileWithWallet(id);
    return ok(
      JsonHelper.replaceBigInts(profile),
      'Profile wallet retrieved successfully',
    );
  }
}
