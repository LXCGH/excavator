import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : true,
  });

  await app.listen(port, host);
  console.log(`Excavator backend listening on http://${host}:${port}`);
}

bootstrap();
