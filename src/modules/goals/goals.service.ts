import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Goal, GoalStatus, Prisma } from '@prisma/client';
import { ASSET_UNIT_PRECISION } from '../../common/constants';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateGoalDto, UpdateGoalDto } from './dtos/goal.dto';
import { GoalRepository, GoalWriteTransaction } from './goal.repository';

export interface GoalView extends Goal {
  currentAmount: bigint;
  remainingAmount: bigint;
  progressPercent: number;
  monthlyRoundup: bigint;
  status: GoalStatus;
}

@Injectable()
export class GoalsService {
  private readonly thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly goalRepo: GoalRepository,
    private readonly prisma: PrismaService,
  ) {}

  async listForUser(userId: string): Promise<GoalView[]> {
    const since = new Date(Date.now() - this.thirtyDaysMs);
    const snapshot = await this.goalRepo.findUserGoalsSnapshot(userId, since);
    if (!snapshot || !snapshot.profile.wallet) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const totalPortfolio =
      snapshot.profile.wallet.fiatBalance +
      snapshot.profile.wallet.positions.reduce(
        (sum, position) =>
          sum +
          (position.totalUnits * position.averageBuyPrice) /
            ASSET_UNIT_PRECISION,
        0n,
      );
    const monthlyRoundup = snapshot.ledgerEntries.reduce(
      (sum, entry) => (entry.amount > 0n ? sum + entry.amount : sum),
      0n,
    );

    return this.allocateProgress(
      snapshot.goals,
      totalPortfolio,
      monthlyRoundup,
    );
  }

  async createForUser(userId: string, dto: CreateGoalDto) {
    this.validateGoalAmount(dto.targetAmount, 'Target amount');
    if (dto.monthlyRoundup !== undefined) {
      this.validateNonNegativeAmount(dto.monthlyRoundup, 'Monthly roundup');
    }

    const exists = await this.goalRepo.userExists(userId);
    if (!exists) throw new NotFoundException(`User ${userId} not found`);

    const sortOrder =
      dto.sortOrder ?? (await this.goalRepo.nextSortOrder(userId));

    await this.prisma.$transaction(async (tx) => {
      await this.goalRepo.createForUser(
        userId,
        {
          title: dto.title.trim(),
          emoji: dto.emoji?.trim() || 'target',
          targetAmount: dto.targetAmount,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
          monthlyRoundup: dto.monthlyRoundup ?? 0n,
          color: dto.color?.trim() || '#2d7a4f',
          sortOrder,
        },
        tx,
      );
      await this.syncUserTargetGoal(userId, tx);
    });

    return this.listForUser(userId);
  }

  async updateForUser(userId: string, goalId: string, dto: UpdateGoalDto) {
    if (dto.targetAmount !== undefined) {
      this.validateGoalAmount(dto.targetAmount, 'Target amount');
    }
    if (dto.monthlyRoundup !== undefined) {
      this.validateNonNegativeAmount(dto.monthlyRoundup, 'Monthly roundup');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.goalRepo.updateForUser(
          userId,
          goalId,
          this.toGoalUpdateInput(dto),
          tx,
        );
        await this.syncUserTargetGoal(userId, tx);
      });
    } catch (error) {
      this.rethrowGoalNotFound(error, goalId);
    }

    return this.listForUser(userId);
  }

  async deleteForUser(userId: string, goalId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.goalRepo.deleteForUser(userId, goalId, tx);
        await this.syncUserTargetGoal(userId, tx);
      });
    } catch (error) {
      this.rethrowGoalNotFound(error, goalId);
    }

    return this.listForUser(userId);
  }

  private allocateProgress(
    goals: Goal[],
    totalPortfolio: bigint,
    monthlyRoundup: bigint,
  ): GoalView[] {
    let remainingPortfolio = totalPortfolio > 0n ? totalPortfolio : 0n;

    return goals.map((goal) => {
      const currentAmount =
        remainingPortfolio > 0n
          ? this.minBigInt(goal.targetAmount, remainingPortfolio)
          : 0n;
      remainingPortfolio -= currentAmount;
      const remainingAmount = goal.targetAmount - currentAmount;
      const progressPercent =
        goal.targetAmount > 0n
          ? Number(((currentAmount * 10_000n) / goal.targetAmount).toString()) /
            100
          : 0;
      const status =
        goal.status === GoalStatus.ACTIVE && currentAmount >= goal.targetAmount
          ? GoalStatus.COMPLETED
          : goal.status;

      return {
        ...goal,
        currentAmount,
        remainingAmount: remainingAmount > 0n ? remainingAmount : 0n,
        progressPercent: Math.min(progressPercent, 100),
        monthlyRoundup:
          goal.monthlyRoundup > 0n ? goal.monthlyRoundup : monthlyRoundup,
        status,
      };
    });
  }

  private toGoalUpdateInput(dto: UpdateGoalDto): Prisma.GoalUpdateInput {
    const data: Prisma.GoalUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.targetAmount !== undefined) data.targetAmount = dto.targetAmount;
    if (dto.emoji !== undefined) data.emoji = dto.emoji.trim() || 'target';
    if (dto.targetDate !== undefined) {
      data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    }
    if (dto.monthlyRoundup !== undefined) {
      data.monthlyRoundup = dto.monthlyRoundup;
    }
    if (dto.color !== undefined) data.color = dto.color.trim() || '#2d7a4f';
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return data;
  }

  private async syncUserTargetGoal(
    userId: string,
    tx: GoalWriteTransaction,
  ): Promise<void> {
    const firstGoal = await this.goalRepo.firstActiveGoal(userId, tx);
    await tx.user.update({
      where: { id: userId },
      data: { targetGoal: firstGoal?.targetAmount ?? null },
    });
  }

  private validateGoalAmount(amount: bigint | undefined, label: string): void {
    if (amount === undefined || typeof amount !== 'bigint') {
      throw new BadRequestException(`${label} must be a valid amount`);
    }
    if (amount <= 0n) {
      throw new BadRequestException(`${label} must be positive`);
    }
  }

  private validateNonNegativeAmount(
    amount: bigint | undefined,
    label: string,
  ): void {
    if (amount === undefined || typeof amount !== 'bigint') {
      throw new BadRequestException(`${label} must be a valid amount`);
    }
    if (amount < 0n) {
      throw new BadRequestException(`${label} must be non-negative`);
    }
  }

  private minBigInt(first: bigint, second: bigint): bigint {
    return first < second ? first : second;
  }

  private rethrowGoalNotFound(error: unknown, goalId: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException(`Goal ${goalId} not found`);
    }
    throw error;
  }
}
