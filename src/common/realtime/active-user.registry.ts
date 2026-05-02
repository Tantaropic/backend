import { Injectable } from '@nestjs/common';

/**
 * In-memory ref-counted set of users currently subscribed to real-time updates
 * (e.g., via SSE). Producers (WalletProjectionService) consult this to avoid
 * doing per-user work for offline users.
 *
 * Lives in `common/realtime` so both WalletModule and the future RealtimeModule
 * can depend on it without a circular import.
 */
@Injectable()
export class ActiveUserRegistry {
  private readonly refs = new Map<string, number>();

  acquire(userId: string): void {
    this.refs.set(userId, (this.refs.get(userId) ?? 0) + 1);
  }

  release(userId: string): void {
    const next = (this.refs.get(userId) ?? 0) - 1;
    if (next <= 0) this.refs.delete(userId);
    else this.refs.set(userId, next);
  }

  has(userId: string): boolean {
    return this.refs.has(userId);
  }

  list(): string[] {
    return [...this.refs.keys()];
  }

  size(): number {
    return this.refs.size;
  }
}
