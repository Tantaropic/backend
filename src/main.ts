import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const frontendUrls = config.get<string>('FRONTEND_URL');
  app.enableCors({
    origin: frontendUrls ? frontendUrls.split(',').map((s) => s.trim()) : true,
    credentials: true,
  });

  // ─── Global Validation Pipe ───
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
}

bootstrap()
  .then(() => {
    console.log(`\n  ✓ Application started on port ${process.env.PORT}\n`);
  })
  .catch((error: unknown) => {
    console.error('\n  ✗ Application failed to start\n', error);
    process.exit(1);
  });
