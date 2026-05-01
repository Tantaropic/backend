import { Global, Module } from '@nestjs/common';
import { ActiveUserRegistry } from './active-user.registry';

@Global()
@Module({
  providers: [ActiveUserRegistry],
  exports: [ActiveUserRegistry],
})
export class RealtimeCommonModule {}
