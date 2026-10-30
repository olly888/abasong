import { Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { ApiError } from "../common/api-error";
@Injectable()
export class SensitiveDatabase {
  private pool: Pool | undefined;
  async connect() {
    if (!process.env.DATABASE_SENSITIVE_URL)
      throw new ApiError(
        503,
        "SENSITIVE_SERVICE_UNAVAILABLE",
        "资料服务暂不可用",
      );
    this.pool ??= new Pool({
      connectionString: process.env.DATABASE_SENSITIVE_URL,
      max: 3,
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
    });
    try {
      return await this.pool.connect();
    } catch {
      throw new ApiError(503, "DATABASE_UNAVAILABLE", "资料服务暂不可用");
    }
  }
  async onModuleDestroy() {
    await this.pool?.end();
  }
}
