import "reflect-metadata";
import { it, expect, vi } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { NearbyController } from "./nearby.controller";
import { NearbyService } from "./nearby.service";
import { MapboxNearbyProvider } from "./mapbox-nearby.provider";
import { ApartmentsService } from "../apartments/apartments.service";
import { MeService } from "../me/me.service";
import { IdentityGuard } from "../auth/identity.guard";
import { TokenVerifier } from "../auth/token-verifier";
import { ApiError } from "../common/api-error";
import { ApiExceptionFilter } from "../common/api-exception.filter";
import type { ApiRequest } from "../common/request-context";
import type { Response, NextFunction } from "express";
it("exercises real discovery HTTP guards, validation, partial provider failure and mid-flight revocation", async () => {
  const user = randomUUID();
  let blocked = false,
    canContribute = false,
    failProvider = false,
    revokeDuringProvider = false,
    calls = 0;
  class TestModule {}
  Module({
    controllers: [NearbyController],
    providers: [
      NearbyService,
      IdentityGuard,
      {
        provide: TokenVerifier,
        useValue: {
          verify: async (h: string) => {
            if (h !== "Bearer TEST")
              throw new ApiError(401, "AUTH_REQUIRED", "TEST");
            return { userId: user, issuedAt: 1 };
          },
        },
      },
      {
        provide: MeService,
        useValue: {
          get: async () => {
            if (blocked) throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "TEST");
            return { capabilities: canContribute ? ["access.contribute"] : [] };
          },
        },
      },
      {
        provide: ApartmentsService,
        useValue: {
          discoverCatalog: async () => [],
          matchSearchAddress: async () => [],
          findConfirmedAddress: async () => [],
        },
      },
      {
        provide: MapboxNearbyProvider,
        useValue: {
          buildings: async () => {
            calls++;
            if (failProvider) throw Error("TEST");
            if (revokeDuringProvider) blocked = true;
            return { items: [], truncated: false };
          },
          reverse: async () => null,
          permanent: async () => {
            throw new ApiError(503, "ADDRESS_STORAGE_UNAVAILABLE", "TEST");
          },
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
  let clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  try {
    const base = await app.getUrl();
    const fix = () => ({
      point: { lng: -118.1, lat: 34.1 },
      observed_at: new Date(clock).toISOString(),
      accuracy_m: 5,
      accuracy_permission: "precise",
    });
    const req = async (
      path: string,
      body: unknown,
      status: number,
      auth = "Bearer TEST",
    ) => {
      const r = await fetch(base + "/v1/apartments/" + path, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(body),
      });
      expect(r.status).toBe(status);
      expect(r.headers.get("cache-control")).toBe("no-store");
      return r.json();
    };
    await req("discover", fix(), 401, "Bearer invalid");
    await req("discover", { ...fix(), actor_id: user }, 400);
    await req(
      "discover",
      { ...fix(), accuracy_permission: "approximate" },
      409,
    );
    expect(calls).toBe(0);
    const catalog = await req("discover", fix(), 200);
    expect(catalog.items).toEqual([]);
    expect(catalog.provider_status).toBe("not_requested");
    failProvider = true;
    const partial = await req("discover/mapbox", fix(), 200);
    expect(partial.provider_status).toBe("unavailable");
    expect(partial.items).toEqual([]);
    await req("discover/mapbox", fix(), 429);
    clock += 31000;
    failProvider = false;
    revokeDuringProvider = true;
    await req("discover/mapbox", fix(), 403);
    blocked = false;
    const contribution = {
      address: {
        address_line1: "100 TEST Ave",
        city: "TEST City",
        state: "CA",
        postal_code: null,
      },
      method: "keypad",
      value: "TEST#",
      source_attested: true,
      address_confirmed: true,
    };
    await req("address-contributions", contribution, 403);
    canContribute = true;
    await req("address-contributions", contribution, 503);
  } finally {
    vi.restoreAllMocks();
    await app.close();
  }
});
