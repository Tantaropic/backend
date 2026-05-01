import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UserRepository } from './user.repository';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Creates a test user with an associated profile and empty wallet.
   * Used for development and demo seeding.
   * @returns The created user with profile and wallet included.
   */
  async createTestUser() {
    const profile = await this.prisma.profile.create({
      data: { name: 'Test Profile' },
    });

    return this.userRepository.create({
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      profile: { connect: { id: profile.id } },
    });
  }

  /**
   * Returns all users in the system.
   * @returns Array of user records.
   */
  async findAll() {
    return this.userRepository.findAll();
  }

  /**
   * Finds a user by ID.
   */
  async findOne(id: string) {
    return this.userRepository.findById(id);
  }
}
