import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfileRepository } from './profile.repository';
import { CreateProfileDto } from './dtos/create-profile.dto';

/**
 * ProfilesService — orchestrates all Profile-level business logic.
 *
 * Key responsibility: "bootstrap a new tenant workspace" — creating
 * a Profile + DigitalWallet + first User atomically.
 * Individual domain services (UsersService, WalletService) remain
 * focused on their own aggregate; they do NOT call each other for init.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly profileRepo: ProfileRepository) {}

  /**
   * Bootstrap a new family / group profile.
   * Creates the Profile, shared DigitalWallet, and first User in one transaction.
   * All three records live or die together (atomicity guaranteed).
   */
  async createProfile(data: CreateProfileDto) {
    return this.profileRepo.createProfileWithWalletAndUser(data);
  }

  /**
   * Convenience method for dev / demo seeding.
   * Generates random data and delegates to createProfile.
   */
  async createRandomProfile(body?: Partial<CreateProfileDto>) {
    const random = this.generateRandomIdentity();
    return this.createProfile({
      profileName: body?.profileName ?? `${random.lastName} Family`,
      email: body?.email ?? random.email,
      userName: body?.userName ?? random.fullName,
    });
  }

  /**
   * Returns a profile with its wallet and all positions.
   */
  async getProfileWithWallet(profileId: string) {
    const profile = await this.profileRepo.findByIdWithWallet(profileId);
    if (!profile) throw new NotFoundException(`Profile ${profileId} not found`);
    return profile;
  }

  /**
   * Returns a profile with all its member users.
   */
  async getProfileWithUsers(profileId: string) {
    const profile = await this.profileRepo.findByIdWithUsers(profileId);
    if (!profile) throw new NotFoundException(`Profile ${profileId} not found`);
    return profile;
  }

  /**
   * Returns a fully-loaded profile (users + wallet + positions).
   */
  async getProfileFull(profileId: string) {
    const profile = await this.profileRepo.findByIdFull(profileId);
    if (!profile) throw new NotFoundException(`Profile ${profileId} not found`);
    return profile;
  }

  /**
   * Returns all profiles in the system.
   */
  async getAllProfiles() {
    return this.profileRepo.findAllWithUsers();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateRandomIdentity(): {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  } {
    const firstNames = [
      'John',
      'Jane',
      'Bob',
      'Alice',
      'Mike',
      'Sarah',
      'Tom',
      'Lisa',
    ];
    const lastNames = [
      'Smith',
      'Doe',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
    ];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}@example.com`;

    return { firstName, lastName, fullName, email };
  }
}
