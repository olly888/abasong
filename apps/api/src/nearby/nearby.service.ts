import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { components } from "@abasong/contracts";
import { addressIdentity } from "@abasong/contracts";
import { ApartmentsService } from "../apartments/apartments.service";
import { MeService } from "../me/me.service";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { MapboxNearbyProvider } from "./mapbox-nearby.provider";
import { addressContribution, checked, freshObservation } from "./nearby-input";
type S = components["schemas"];
@Injectable()
export class NearbyService {
  private rates = new Map<string, number>();
  private addressRates = new Map<string, { until: number; count: number }>();
  private addressBudget(actor: string) {
    const now = Date.now();
    for (const [k, v] of this.addressRates)
      if (v.until <= now) this.addressRates.delete(k);
    for (const [k, max, ms] of [
      ["*", 2, 1000],
      [actor, 5, 60000],
    ] as const) {
      const r = this.addressRates.get(k) ?? { until: now + ms, count: 0 };
      if (r.count >= max || this.addressRates.size >= 1000)
        throw new ApiError(
          429,
          "ADDRESS_RATE_LIMITED",
          "新地址添加较频繁，请稍后重试",
        );
      r.count++;
      this.addressRates.set(k, r);
    }
  }
  constructor(
    @Inject(ApartmentsService) private readonly apartments: ApartmentsService,
    @Inject(MeService) private readonly accounts: MeService,
    @Inject(MapboxNearbyProvider) private readonly maps: MapboxNearbyProvider,
  ) {}
  async discover(
    a: VerifiedIdentity,
    body: unknown,
    provider = false,
  ): Promise<S["NearbyDiscovery"]> {
    const p = freshObservation(body);
    await this.accounts.get(a);
    const catalog = await this.apartments.discoverCatalog(a, p.point);
    const base: S["NearbyDiscovery"] = {
      items: catalog,
      radius_m: 200,
      expires_at: new Date(Date.now() + 20000).toISOString(),
      truncated: catalog.length === 20,
      provider_status: "not_requested",
      attribution: "",
      use_mode: "temporary",
    };
    if (!provider) return base;
    const now = Date.now();
    for (const [k, v] of this.rates) if (v <= now) this.rates.delete(k);
    if (
      (this.rates.get(a.userId) ?? 0) > now ||
      (this.rates.get("*") ?? 0) > now ||
      this.rates.size >= 1000
    )
      throw new ApiError(
        429,
        "DISCOVERY_RATE_LIMITED",
        "附近资料正在更新，请稍后重试",
      );
    this.rates.set(a.userId, now + 25000);
    this.rates.set("*", now + 1000);
    try {
      const buildings = await this.maps.buildings(p.point);
      const points = await this.apartments.uncoveredDiscoveryPoints(
        a,
        buildings.items,
      );
      const items: S["NearbyCandidate"][] = [];
      const seen = new Set(
        catalog.map((c) => addressIdentity(c.address)).filter(Boolean),
      );
      // Bounded enrichment; never persist provider points, addresses or geometry.
      const suggested = await Promise.all(
        points.slice(0, 4).map(async (b) => {
          let address: S["SearchAddress"] | null = null;
          try {
            address = await this.maps.reverse(b.point);
          } catch {
            /* Keep an unresolved confirmation card. */
          }
          return { b, address };
        }),
      );
      for (const { b, address } of suggested) {
        const key = addressIdentity(address);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        items.push({
          key: randomUUID(),
          source: "mapbox",
          apartment: null,
          address,
          point: b.point,
          distance_m: b.distance_m,
          classification: "apartments",
          requires_address_confirmation: true,
        });
      }
      freshObservation(body);
      await this.accounts.get(a);
      return {
        ...base,
        items,
        truncated: buildings.truncated || points.length > 4,
        provider_status: "ok",
        attribution: "© Mapbox © OpenStreetMap",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) throw e;
      return { ...base, items: [], provider_status: "unavailable" };
    }
  }
  async contribute(
    a: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
  ): Promise<S["AddressContributionResult"]> {
    const b = checked(addressContribution, body);
    const me = await this.accounts.get(a);
    if (!me.capabilities.includes("access.contribute"))
      throw new ApiError(403, "CAPABILITY_REQUIRED", "当前没有此操作资格");
    if (!z.string().uuid().safeParse(key).success)
      throw new ApiError(400, "INVALID_INPUT", "提交编号无效，请重试");
    const found = await this.apartments.findConfirmedAddress(a, b.address);
    if (!found.length) this.addressBudget(a.userId);
    const permanent = found.length
      ? undefined
      : await this.maps.permanent(b.address);
    return this.apartments.contributeAddress(a, b, key!, permanent);
  }
}
