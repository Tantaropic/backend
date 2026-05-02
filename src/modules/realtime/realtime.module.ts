import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

/**
 * SSE real-time event bridge.
 *
 * Depends only on `UsersModule` (for the hello snapshot) and the global
 * `EventEmitter2`. Can be removed from `AppModule` without side-effects.
 */
@Module({
  imports: [UsersModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
})
export class RealtimeModule {}
