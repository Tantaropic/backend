import { Module } from '@nestjs/common';
import { MockExchangeController } from './mock-exchange.controller';
import { MockExchangeService } from './mock-exchange.service';

@Module({
  controllers: [MockExchangeController],
  providers: [MockExchangeService],
  exports: [MockExchangeService],
})
export class MockExchangeModule {}
