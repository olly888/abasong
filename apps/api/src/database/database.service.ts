import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
@Injectable()
export class Database {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
  });
  async onModuleDestroy() {
    await this.pool.end();
  }
}
