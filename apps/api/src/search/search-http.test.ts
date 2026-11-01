import "reflect-metadata";
import { expect, it } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { MapboxSearchProvider } from "./mapbox-search.provider";
import { MeService } from "../me/me.service";
import { ApartmentsService } from "../apartments/apartments.service";
import { IdentityGuard } from "../auth/identity.guard";
import { TokenVerifier } from "../auth/token-verifier";
import { ApiError } from "../common/api-error";
import { ApiExceptionFilter } from "../common/api-exception.filter";
import type { ApiRequest } from "../common/request-context";
import type { Response, NextFunction } from "express";
it("exercises actual HTTP routes, guards, DTOs and account/session isolation with synthetic upstream", async () => {
  const actor = randomUUID(),
    other = randomUUID();
  let blocked = false;
  let calls = 0;
  const suggestion = {
    provider_result_id: "test:id",
    title: "TEST address",
    label: "TEST address",
    subtitle: "TEST",
    address: null,
  };
  class TestModule {}
  Module({
    controllers: [SearchController],
    providers: [
      SearchService,
      IdentityGuard,
      {
        provide: TokenVerifier,
        useValue: {
          verify: async (h: string) => {
            if (!["Bearer TEST-a", "Bearer TEST-b"].includes(h))
              throw new ApiError(401, "AUTH_REQUIRED", "TEST");
            return { userId: h.endsWith("a") ? actor : other, issuedAt: 1 };
          },
        },
      },
      {
        provide: MeService,
        useValue: {
          get: async () => {
            if (blocked) throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "TEST");
            return {};
          },
        },
      },
      {
        provide: ApartmentsService,
        useValue: { matchSearchAddress: async () => [] },
      },
      {
        provide: MapboxSearchProvider,
        useValue: {
          suggest: async () => {
            calls++;
            return { items: [suggestion], attribution: "TEST" };
          },
          retrieve: async () => ({
            ...suggestion,
            point: { lng: -118.1, lat: 34.1 },
            attribution: "TEST",
          }),
        },
      },
    ],
  })(TestModule);
  const app = await NestFactory.create<NestExpressApplication>(TestModule, {
    logger: false,
  });
  app.use((r: ApiRequest, s: Response, n: NextFunction) => {
    r.requestId = randomUUID();
    s.setHeader("Cache-Control", "no-store");
    n();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  try {
    const base = await app.getUrl(),
      session_token = randomUUID();
    const req = async (
      path: string,
      body: unknown,
      status: number,
      auth = "Bearer TEST-a",
    ) => {
      const r = await fetch(base + "/v1/search/addresses/" + path, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(r.status).toBe(status);
      expect(r.headers.get("cache-control")).toBe("no-store");
      return r.json();
    };
    const input = { query: "TEST", session_token };
    await req("suggest", input, 401, "");
    await req("suggest?query=TEST", input, 400);
    await req("suggest", { ...input, user_id: other }, 400);
    expect(calls).toBe(0);
    const result = await req("suggest", input, 200);
    expect(Object.keys(result).sort()).toEqual([
      "attribution",
      "items",
      "session_token",
      "use_mode",
    ]);
    const pick = { session_token, provider_result_id: "test:id" };
    await req("retrieve", pick, 409, "Bearer TEST-b");
    await req("retrieve", { ...pick, provider_result_id: "unknown" }, 409);
    const dest = await req("retrieve", pick, 200);
    expect(dest.match_status).toBe("unmatched");
    expect(dest.apartments).toEqual([]);
    expect(dest).not.toHaveProperty("access_records");
    blocked = true;
    await req("retrieve", pick, 403);
    await req("suggest", { ...input, session_token: randomUUID() }, 403);
    expect(calls).toBe(1);
  } finally {
    await app.close();
  }
});
