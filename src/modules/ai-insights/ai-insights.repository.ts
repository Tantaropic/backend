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
}
