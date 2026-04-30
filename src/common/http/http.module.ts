import { Module, Global } from '@nestjs/common';
import { HttpModule as NestHttpModule } from '@nestjs/axios';
import { HttpClientService } from './http-client.service';

@Global()
@Module({
  imports: [NestHttpModule],
  providers: [HttpClientService],
  exports: [HttpClientService, NestHttpModule],
})
export class HttpModule {}
