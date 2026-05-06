import { Injectable } from '@nestjs/common';
import { Goal, GoalStatus, LedgerEntryType, Prisma } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

export type GoalWriteTransaction = Prisma.TransactionClient | PrismaService;
type CreateGoalData = Omit<Prisma.GoalUncheckedCreateInput, 'userId'>;

@Injectable()
export class GoalRepository extends BaseRepository<Goal> {
  constructor(prisma: PrismaService) {
    super(prisma, 'goal');
  }

  async findUserGoalsSnapshot(userId: string, since: Date) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        goals: {
          where: { status: { not: GoalStatus.ARCHIVED } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        profile: {
          include: {
            wallet: {
              include: { positions: true },
            },
          },
        },
        ledgerEntries: {
          where: {
            createdAt: { gte: since },
            type: {
              in: [LedgerEntryType.ROUNDUP, LedgerEntryType.USER_DEPOSIT],
            },
          },
          select: { amount: true },
        },
      },
    });
  }

  async userExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    return user !== null;
  }

  async nextSortOrder(userId: string) {
    const last = await this.prisma.goal.findFirst({
      where: { userId, status: { not: GoalStatus.ARCHIVED } },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async createForUser(
    userId: string,
    data: CreateGoalData,
    tx: GoalWriteTransaction = this.prisma,
  ) {
    return tx.goal.create({ data: { ...data, userId } });
  }

  async updateForUser(
    userId: string,
    goalId: string,
    data: Prisma.GoalUpdateInput,
    tx: GoalWriteTransaction = this.prisma,
  ) {
    return tx.goal.update({
      where: { id: goalId, userId },
      data,
    });
  }

  async deleteForUser(
    userId: string,
    goalId: string,
    tx: GoalWriteTransaction = this.prisma,
  ) {
    return tx.goal.delete({ where: { id: goalId, userId } });
  }

  async firstActiveGoal(
    userId: string,
    tx: GoalWriteTransaction = this.prisma,
  ) {
    return tx.goal.findFirst({
      where: { userId, status: GoalStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
