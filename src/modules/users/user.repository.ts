import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RiskProfile } from '../../common/enums';

/**
 * UserRepository — ACL between the DB and the User domain.
 * All Prisma user queries are encapsulated here; services never touch prisma.user directly.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(prisma: PrismaService) {
    super(prisma, 'user');
  }

  /**
   * Find a user by ID and include their full profile → wallet → positions tree.
   */
  async findByIdWithProfileAndWallet(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: {
            wallet: {
              include: { positions: true },
            },
          },
        },
      },
    });
  }

  /**
   * Find a user by ID and include the last N ledger entries.
   */
  async findByIdWithDashboard(userId: string, ledgerLimit = 10) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: {
            wallet: {
              include: { positions: true },
            },
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: ledgerLimit,
        },
      },
    });
  }

  /**
   * Retrieve all users with their associated profile.
   */
  async findAllWithProfile() {
    return this.prisma.user.findMany({
      include: { profile: true },
    });
  }

  /**
   * Create a new user and link them to an existing profile.
   */
  async createForProfile(data: {
    email: string;
    name: string;
    profileId: string;
    riskProfile?: RiskProfile;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Partially update user settings (risk profile / target goal).
   */
  async updateSettings(
    userId: string,
    riskProfile?: RiskProfile,
    targetGoal?: bigint,
  ): Promise<User> {
    const data: { riskProfile?: RiskProfile; targetGoal?: bigint } = {};
    if (riskProfile !== undefined) data.riskProfile = riskProfile;
    if (targetGoal !== undefined) data.targetGoal = targetGoal;

    return this.prisma.user.update({ where: { id: userId }, data });
  }
}
