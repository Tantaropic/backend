import { Injectable } from '@nestjs/common';
import { AiInsight } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AiInsightsRepository extends BaseRepository<AiInsight> {
  constructor(prisma: PrismaService) {
    super(prisma, 'aiInsight');
  }

  async saveInsight(data: {
    userId: string;
    message: string;
    transactionEventId?: string;
    idempotencyKey?: string;
    triggerTag?: string;
  }): Promise<AiInsight> {
    return this.db.create({ data });
  }

  async findByUser(userId: string): Promise<AiInsight[]> {
    return this.db.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdempotencyKey(key: string): Promise<AiInsight | null> {
    return this.db.findUnique({ where: { idempotencyKey: key } });
  }

  /**
   * Returns all wallets that have any activity (positions OR non-zero fiat balance),
   * along with the userIds attached to the owning profile. Used by the daily pulse cron.
   */
  async findActiveWalletsWithUsers(): Promise<
    Array<{
      walletId: string;
      profileId: string;
      fiatBalance: bigint;
      userIds: string[];
      positions: Array<{ totalUnits: bigint; averageBuyPrice: bigint }>;
    }>
  > {
    const wallets = await this.prisma.digitalWallet.findMany({
      where: {
        OR: [{ fiatBalance: { gt: 0n } }, { positions: { some: {} } }],
      },
      include: {
        positions: { select: { totalUnits: true, averageBuyPrice: true } },
        profile: { include: { users: { select: { id: true } } } },
      },
    });

    return wallets.map((w) => ({
      walletId: w.id,
      profileId: w.profileId,
      fiatBalance: w.fiatBalance,
      userIds: w.profile.users.map((u) => u.id),
      positions: w.positions,
    }));
  }
}
