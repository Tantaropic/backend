import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { UsersModule } from '../modules/users/users.module';
import { MockBankModule } from '../modules/mock-bank/mock-bank.module';
import { MockExchangeModule } from '../modules/mock-exchange/mock-exchange.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    MockBankModule,
    MockExchangeModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
