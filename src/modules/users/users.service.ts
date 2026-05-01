import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LedgerEntryType } from '../../common/enums';
import { UserRepository } from './user.repository';
import { UpdateUserSettingsDto } from './dtos/update-user-settings.dto';
import { CreateUserForProfileDto } from './dtos/create-user.dto';
import { RiskProfile } from '../../common/enums';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly userRepo: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns all users with their associated profile.
   */
  async findAll() {
    return this.userRepo.findAllWithProfile();
  }

  /**
   * Find a single user by ID, including profile and wallet info.
   */
  async findOne(userId: string) {
    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  /**
   * Create a new user linked to a profile.
   */
  async create(data: CreateUserForProfileDto): Promise<User> {
    return this.userRepo.createForProfile(data);
  }

  /**
   * Full dashboard snapshot for a single user.
   * Includes profile → wallet → positions and the last 10 ledger entries.
   */
  async getDashboard(userId: string) {
    const user = await this.userRepo.findByIdWithDashboard(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  /**
   * Update a user's risk profile and / or savings target goal.
   * Only fields that are explicitly provided are updated.
   */
  async updateSettings(userId: string, settings: UpdateUserSettingsDto) {
    const targetGoalBigInt =
      settings.targetGoal !== undefined
        ? BigInt(settings.targetGoal)
        : undefined;
    return this.userRepo.updateSettings(
      userId,
      settings.riskProfile,
      targetGoalBigInt,
    );
  }

  /**
   * Simulates a fiat deposit into the user's shared profile wallet.
   * Creates a LedgerEntry and increments the wallet balance atomically.
   *
   * Uses Optimistic Concurrency Control (OCC) on the wallet version column
   * to prevent double-credit in concurrent scenarios.
   */
  async simulateDeposit(userId: string, amount: bigint) {
    this.logger.log(`Simulating deposit of ${amount} for user ${userId}`);
    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);

    if (!user || !user.profile.wallet) {
      throw new NotFoundException('User or Wallet not found');
    }

    const wallet = user.profile.wallet;

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Record the deposit in the ledger
        await tx.ledgerEntry.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            type: LedgerEntryType.USER_DEPOSIT, // enum from common/enums — no magic strings
            amount,
          },
        });

        // 2. Increment fiat balance; OCC check ensures no concurrent version mismatch
        return tx.digitalWallet.update({
          where: {
            id: wallet.id,
            version: wallet.version, // OCC guard
          },
          data: {
            fiatBalance: { increment: amount },
            version: { increment: 1 },
          },
        });
      },
      {
        maxWait: 5000, // Time (ms) to wait to acquire a connection from the pool
        timeout: 10000, // Time (ms) the transaction has to finish once started
      },
    );
  }

  mockIfEmpty(body: Partial<CreateUserForProfileDto>): CreateUserForProfileDto {
    return {
      email: body.email ?? 'test@test.com',
      name: body.name ?? 'test',
      profileId: body.profileId ?? 'test',
      riskProfile: body.riskProfile ?? RiskProfile.DEFAULT,
    };
  }
}
