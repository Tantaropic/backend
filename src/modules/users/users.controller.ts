import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ok } from '../../common/helpers/response.helper';
import type { IApiResponse } from '../../common/dtos/response.dto';
import { JsonHelper } from '../../common/helpers';
import { UpdateUserSettingsDto } from './dtos/update-user-settings.dto';
import {
  CreateUserForProfileDto,
  CreateUserForProfileResponseDto,
} from './dtos/create-user.dto';
import { AssetClass } from '../../common/enums';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users
   * Returns all users with their associated profile.
   */
  @Get()
  async getAll(): Promise<IApiResponse<any>> {
    const users = await this.usersService.findAll();
    return ok(JsonHelper.replaceBigInts(users), 'Users retrieved successfully');
  }

  /**
   * GET /users/:id
   * Returns a single user with their profile and wallet info.
   */
  @Get(':id')
  async getOne(@Param('id') id: string): Promise<IApiResponse<any>> {
    const user = await this.usersService.findOne(id);
    return ok(JsonHelper.replaceBigInts(user), 'User retrieved successfully');
  }

  /**
   * POST /users
   * Creates a new user and links them to a profile.
   */
  @Post('profile/:profileId')
  async create(
    @Param('profileId') profileId: string,
    @Body() body: Partial<CreateUserForProfileDto>,
  ): Promise<IApiResponse<CreateUserForProfileResponseDto>> {
    const userData: CreateUserForProfileDto =
      this.usersService.mockIfEmpty(body);

    const user = await this.usersService.create({
      ...userData,
      profileId,
    });

    return ok(
      JsonHelper.replaceBigInts(user),
      'User created successfully',
      201,
    );
  }

  /**
   * GET /users/:id/dashboard
   * Full user dashboard: profile, wallet, positions, last N ledger entries.
   * @query ledgerLimit Optional. Defaults to 100. Capped server-side.
   */
  @Get(':id/dashboard')
  async getDashboard(
    @Param('id') id: string,
    @Query('ledgerLimit') ledgerLimit?: string,
  ): Promise<IApiResponse<any>> {
    const parsed = ledgerLimit ? Math.min(Number(ledgerLimit), 500) : 100;
    const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    const dashboard = await this.usersService.getDashboard(id, limit);
    return ok(
      JsonHelper.replaceBigInts(dashboard),
      'Dashboard retrieved successfully',
    );
  }

  /**
   * PATCH /users/:id/settings
   * Update risk profile and / or savings target goal.
   */
  @Patch(':id/settings')
  async updateSettings(
    @Param('id') id: string,
    @Body() body: UpdateUserSettingsDto,
  ): Promise<IApiResponse<any>> {
    const updated = await this.usersService.updateSettings(id, body);
    return ok(
      JsonHelper.replaceBigInts(updated),
      'Settings updated successfully',
    );
  }

  /**
   * POST /users/:id/simulate-deposit
   * Simulates a fiat deposit into the user's shared wallet (dev / demo use).
   * Amounts are in the smallest unit (piasters for EGP).
   */
  @Post(':id/simulate-deposit')
  async simulateDeposit(
    @Param('id') id: string,
    @Body() body: { amount: number },
  ): Promise<IApiResponse<any>> {
    const amountBigInt = BigInt(body.amount);
    const wallet = await this.usersService.simulateDeposit(id, amountBigInt);
    return ok(
      JsonHelper.replaceBigInts(wallet),
      'Deposit simulated successfully',
    );
  }

  /**
   * POST /users/:id/simulate-withdraw
   * Simulates withdrawing available fiat from the user's shared wallet.
   * Amounts are in the smallest unit (piasters for EGP).
   */
  @Post(':id/simulate-withdraw')
  async simulateWithdraw(
    @Param('id') id: string,
    @Body() body: { amount: number },
  ): Promise<IApiResponse<any>> {
    const amount = Number(body.amount);
    const amountBigInt = Number.isFinite(amount)
      ? BigInt(Math.round(amount))
      : 0n;
    const wallet = await this.usersService.simulateWithdraw(id, amountBigInt);
    return ok(
      JsonHelper.replaceBigInts(wallet),
      'Withdrawal simulated successfully',
    );
  }

  /**
   * POST /users/:id/simulate-sell
   * Sells an owned asset position and credits the proceeds to available cash.
   * Amounts are in piasters; units are fixed-point asset units.
   */
  @Post(':id/simulate-sell')
  async simulateSell(
    @Param('id') id: string,
    @Body()
    body: {
      assetClass: AssetClass;
      units?: string | number;
      amount?: string | number;
    },
  ): Promise<IApiResponse<any>> {
    const result = await this.usersService.simulateSell(id, {
      assetClass: body.assetClass,
      units:
        body.units !== undefined && body.units !== null
          ? BigInt(body.units)
          : undefined,
      amount:
        body.amount !== undefined && body.amount !== null
          ? BigInt(body.amount)
          : undefined,
    });
    return ok(JsonHelper.replaceBigInts(result), 'Sell simulated successfully');
  }
}
