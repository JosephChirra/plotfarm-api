import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/exceptions/http-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import { SchemaReadinessService } from './core/health/schema-readiness.service';
import { join } from 'path';
import * as express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.use(cookieParser());

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads static files from browser
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors({
    origin: config.get<string[]>('cors.origins') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const port = config.get<number>('port') ?? 3001;

  try {
    const readiness = app.get(SchemaReadinessService);
    const report = await readiness.check();
    if (!report.ok) {
      // Startup warning only; do not prevent boot in dev.
      // Use GET /health/schema to verify before serving traffic in production deploys.
      // eslint-disable-next-line no-console
      console.warn(
        `[schema-readiness] NOT READY (${report.issues.length} issue(s))`,
        report.issues.map((i) => i.message),
      );
    }
  } catch {
    // ignore readiness errors at boot; health endpoint will reflect status
  }

  await app.listen(port);
  console.log(`PlotFarm API running on http://localhost:${port}`);
}
bootstrap();
