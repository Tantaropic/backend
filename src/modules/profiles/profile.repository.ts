import { Injectable } from '@nestjs/common';
import { Profile } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * ProfileRepository — ACL between the DB and the Profile aggregate root.
 * A Profile is the top-level tenant entity that owns the shared DigitalWallet
 * and groups one or more Users (family / friends).
 */
@Injectable()
export class ProfileRepository extends BaseRepository<Profile> {
  constructor(prisma: PrismaService) {
    super(prisma, 'profile');
  }

  /**
   * Find a profile and include its wallet with all positions.
   */
  async findByIdWithWallet(profileId: string) {
    return this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        wallet: {
          include: { positions: true },
        },
      },
    });
  }

  /**
   * Find a profile and include its users.
   */
  async findByIdWithUsers(profileId: string) {
    return this.prisma.profile.findUnique({
      where: { id: profileId },
      include: { users: true },
    });
  }

  /**
   * Find a profile and eagerly load users + wallet + positions.
   */
  async findByIdFull(profileId: string) {
    return this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        users: true,
        wallet: {
          include: { positions: true },
        },
      },
    });
  }

  /**
   * Retrieve all profiles, each with their member count.
   */
  async findAllWithUsers() {
    return this.prisma.profile.findMany({
      include: { users: true },
    });
  }

  /**
   * Atomically creates a Profile together with its shared DigitalWallet
   * and the first member User — all inside a single DB transaction.
   *
   * This is the canonical "bootstrap a new tenant workspace" operation.
   * The WalletService and UsersService should NOT be called here directly;
   * all writes happen via nested Prisma creates inside the transaction to
   * keep the Profile as the single point of truth for initialization.
   */
  async createProfileWithWalletAndUser(data: {
    profileName: string;
    email: string;
    userName: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. Create the Profile and its shared DigitalWallet in one nested write.
        const profile = await tx.profile.create({
          data: {
            name: data.profileName,
            wallet: {
              create: {
                fiatBalance: 0n, // BigInt zero — no raw strings
              },
            },
          },
          include: { wallet: true },
        });

        // 2. Create the first User and link them to the new Profile.
        const user = await tx.user.create({
          data: {
            email: data.email,
            name: data.userName,
            profileId: profile.id,
          },
        });

        return { profile, wallet: profile.wallet!, user };
      },
      {
        maxWait: 5000, // Time (ms) to wait to acquire a connection from the pool
        timeout: 10000, // Time (ms) the transaction has to finish once started
      },
    );
  }
}
