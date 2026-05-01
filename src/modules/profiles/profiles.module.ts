import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ProfileRepository } from './profile.repository';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';

/**
 * ProfilesModule — owns the Profile aggregate root.
 *
 * Dependency graph at init time (no circular deps):
 *   ProfileRepository → PrismaService
 *   ProfilesService   → ProfileRepository
 *   ProfilesController→ ProfilesService
 *
 * The atomic Profile + Wallet + User creation is handled entirely inside
 * ProfileRepository.createProfileWithWalletAndUser via a single $transaction,
 * so neither WalletModule nor UsersModule needs to be imported here.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProfilesController],
  providers: [ProfileRepository, ProfilesService],
  exports: [ProfilesService, ProfileRepository],
})
export class ProfilesModule {}
