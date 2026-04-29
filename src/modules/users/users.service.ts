import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates a test user with an associated profile and empty wallet.
   * Used for development and demo seeding.
   * @returns The created user with profile and wallet included.
   */
  async createTestUser() {
    const profile = await this.prisma.profile.create({
      data: { name: 'Test Profile' },
    });

    return this.prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        profileId: profile.id,
      },
      include: { profile: true },
    });
  }

  /**
   * Returns all users in the system.
   * @returns Array of user records.
   */
  async findAll() {
    return this.prisma.user.findMany({
      include: { profile: true },
    });
  }
}
