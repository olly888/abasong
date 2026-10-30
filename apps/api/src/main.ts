import 'reflect-metadata';
import { Controller, Get, Inject, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

@Injectable()
class Database {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  async onModuleDestroy() { await this.pool.end(); }
}
@Controller('health')
class HealthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    try {
      const result = await this.db.pool.query("SELECT version FROM abasong.schema_version WHERE version = 'V12.0001'");
      if (result.rowCount !== 1) throw new Error('schema');
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }
}
@Module({ controllers: [HealthController], providers: [Database] })
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), process.env.API_HOST ?? '127.0.0.1');
  console.log('API started');
}
main().catch(() => { console.error('API startup failed'); process.exitCode = 1; });
