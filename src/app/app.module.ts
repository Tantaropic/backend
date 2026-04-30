import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { UsersModule } from '../modules/users/users.module';
import { MockBankModule } from '../external-api/mock-bank/mock-bank.module';
import { ExchangeIntegrationModule } from '../modules/exchange-integration/exchange-integration.module';
import { MockExchangeModule } from '../external-api/mock-exchange/mock-exchange.module';
import { HttpModule } from '../common/http/http.module';
import { LlmModule } from '../common/llm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BankIntegrationModule } from '../modules/bank-integration/bank-integration.module';
import { AiInsightsModule } from '../modules/ai-insights/ai-insights.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    MockBankModule,
    ExchangeIntegrationModule,
    MockExchangeModule,
    HttpModule,
    LlmModule,
    BankIntegrationModule,
    AiInsightsModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      verboseMemoryLeak: true,
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
