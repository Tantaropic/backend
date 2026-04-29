import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MockBankController } from './mock-bank.controller';
import { MockBankService } from './mock-bank.service';

@Module({
  imports: [HttpModule],
  controllers: [MockBankController],
  providers: [MockBankService],
  exports: [MockBankService],
})
export class MockBankModule {}
