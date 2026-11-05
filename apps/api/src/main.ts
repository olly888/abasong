import { DevicesService } from "./requests/devices.service";
import {
  DevicesController,
  InstallationRevocationController,
} from "./requests/devices.controller";
import { assertSchemaReady } from "./database/schema-readiness";
import { createEnvelope, ENVELOPE_CRYPTO } from "./encryption/provider";
import { assertRuntimeEnvironment } from "@abasong/runtime";
import "reflect-metadata";
import { NearbyController } from "./nearby/nearby.controller";
import { NearbyService } from "./nearby/nearby.service";
import { MapboxNearbyProvider } from "./nearby/mapbox-nearby.provider";
import { SearchController } from "./search/search.controller";
import { SearchService } from "./search/search.service";
import { MapboxSearchProvider } from "./search/mapbox-search.provider";
import { ImportsController } from "./imports/imports.controller";
import { ImportsService } from "./imports/imports.service";
import { ApartmentsController } from "./apartments/apartments.controller";
import { ApartmentsService } from "./apartments/apartments.service";
import { SensitiveDatabase } from "./apartments/sensitive-database";
import { RequestsController } from "./requests/requests.controller";
import { RequestsService } from "./requests/requests.service";
import { CollaborationController } from "./requests/collaboration.controller";
import { MessagingService } from "./requests/messaging.service";
import { CollaborationService } from "./requests/collaboration.service";
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Database } from "./database/database.service";
import { MeController } from "./me/me.controller";
import { MeService } from "./me/me.service";
import { TokenVerifier } from "./auth/token-verifier";
import { IdentityGuard } from "./auth/identity.guard";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import type { ApiRequest } from "./common/request-context";
import type { Response, NextFunction } from "express";
import { cloudHttpProtection } from "./common/cloud-http";

@Controller("health")
class HealthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    try {
      await assertSchemaReady((text, values) =>
        this.db.pool.query(text, values),
      );
      return { status: "ready" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
  }
}
@Module({
  controllers: [
    HealthController,
    MeController,
    ApartmentsController,
    ImportsController,
    SearchController,
    NearbyController,
    RequestsController,
    CollaborationController,
    DevicesController,
    InstallationRevocationController,
  ],
  providers: [
    { provide: ENVELOPE_CRYPTO, useFactory: createEnvelope },
    Database,
    MeService,
    TokenVerifier,
    IdentityGuard,
    SensitiveDatabase,
    ApartmentsService,
    ImportsService,
    SearchService,
    NearbyService,
    RequestsService,
    CollaborationService,
    MessagingService,
    DevicesService,
    {
      provide: MapboxNearbyProvider,
      useFactory: () => new MapboxNearbyProvider(),
    },
    {
      provide: MapboxSearchProvider,
      useFactory: () => new MapboxSearchProvider(),
    },
  ],
})
class AppModule {}
async function main() {
  const runtime = assertRuntimeEnvironment("api");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: runtime === "pilot-dev" ? false : ["error", "warn"],
  });
  if (runtime === "pilot-dev") app.set("trust proxy", 1);
  app.use((req: ApiRequest, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-ID", req.requestId);
    if (req.path.startsWith("/v1/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  if (runtime === "pilot-dev") app.use(cloudHttpProtection());
  // Only batch candidate JSON needs the larger budget; retain the existing
  // 16 KiB protection for authentication and every other business route.
  app.useBodyParser("json", {
    limit: "128kb",
    type: (req) =>
      /^\/v1\/me\/import-batches(?:\/|$)/.test(
        (req.url ?? "").split("?")[0] ?? "",
      ) && /^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""),
  });
  app.useBodyParser("json", { limit: "16kb" });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.API_PORT ?? 3001),
    process.env.API_HOST ?? "127.0.0.1",
  );
  console.log("API started");
}
main().catch(() => {
  console.error("API startup failed");
  process.exitCode = 1;
});
