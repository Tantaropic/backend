import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Interface representing common Prisma model delegate operations.
 * Used to provide type safety in the BaseRepository without leaking specific model types.
 */
interface PrismaModelDelegate<T> {
  findUnique(args: { where: any }): Promise<T | null>;
  findMany(args?: any): Promise<T[]>;
  delete(args: { where: any }): Promise<T>;
  create(args: { data: any }): Promise<T>;
  update(args: { where: any; data: any }): Promise<T>;
  upsert(args: { where: any; create: any; update: any }): Promise<T>;
  updateMany(args: { where: any; data: any }): Promise<{ count: number }>;
}

/**
 * BaseRepository acts as the "Anti-Corruption Layer" (ACL) between the database and the domain.
 * It encapsulates Prisma primitives to prevent leaking database-specific implementation details
 * into the business logic layer.
 *
 * This abstract class provides standard CRUD operations while reducing boilerplate across specific repositories.
 */
export abstract class BaseRepository<T> {
  constructor(
    protected readonly prisma: PrismaService,
    private readonly modelName: string,
  ) {}

  /**
   * Helper to access the specific Prisma model delegate.
   * Typed as PrismaModelDelegate<T> to satisfy strict linting and provide basic type safety.
   */
  protected get db(): PrismaModelDelegate<T> {
    return (this.prisma as unknown as Record<string, PrismaModelDelegate<T>>)[
      this.modelName
    ];
  }

  /**
   * Find a record by its unique identifier.
   */
  async findById(id: string): Promise<T | null> {
    return this.db.findUnique({ where: { id } });
  }

  /**
   * Retrieve all records for the entity.
   */
  async findAll(): Promise<T[]> {
    return this.db.findMany();
  }

  /**
   * Delete a record by its unique identifier.
   */
  async delete(id: string): Promise<T> {
    return this.db.delete({ where: { id } });
  }
}
