import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // ─── Global Exception Filter ───
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(process.env.PORT || 3000);
}

bootstrap()
  .then(() => {
    console.log(`\n  ✓ Application started on port ${process.env.PORT}\n`);
  })
  .catch((error: unknown) => {
    console.error('\n  ✗ Application failed to start\n', error);
    process.exit(1);
  });
