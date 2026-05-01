import { Injectable } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(prisma: PrismaService) {
    super(prisma, 'user');
  }

  /**
   * Retrieves a user by ID without any relational joins.
   * Leverages the base repository primitives.
   */
  async getUser(id: string): Promise<User | null> {
    return this.findById(id);
  }

  /**
   * Finds a user by ID and includes their associated profile and wallet.
   * This is useful for dashboard and aggregate root operations.
   */
  async findByIdWithProfileAndWallet(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: {
          include: {
            wallet: true,
          },
        },
      },
    });
  }

  /**
   * Finds a user by email.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.db.findUnique({ where: { email } });
  }

  /**
   * Creates a new user record.
   */
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.create({ data });
  }

  /**
   * Updates user settings such as risk profile or target goal.
   */
  async updateSettings(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.db.update({
      where: { id },
      data,
    });
  }
}
