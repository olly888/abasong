import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Database } from './database/database.service';
import { MeController } from './me/me.controller';
import { MeService } from './me/me.service';
import { TokenVerifier } from './auth/token-verifier';
import { IdentityGuard } from './auth/identity.guard';
import { ApiExceptionFilter } from './common/api-exception.filter';
import type { ApiRequest } from './common/request-context';
import type { Response, NextFunction } from 'express';

@Controller('health')
class HealthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      const result = await this.db.pool.query(
        "SELECT version FROM abasong.schema_version WHERE version = 'V12.0001'",
      );
      if (result.rowCount !== 1) throw new Error('schema');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
@Module({
  controllers: [HealthController, MeController],
  providers: [Database, MeService, TokenVerifier, IdentityGuard],
})
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.use((req: ApiRequest, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    if (req.path.startsWith('/v1/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.API_PORT ?? 3001),
    process.env.API_HOST ?? '127.0.0.1',
  );
  console.log('API started');
}
main().catch(() => {
  console.error('API startup failed');
  process.exitCode = 1;
});
