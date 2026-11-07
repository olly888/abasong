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
  private addressBudget(actor: string, batch = false) {
    const now = Date.now();
    for (const [k, v] of this.addressRates)
      if (v.until <= now) this.addressRates.delete(k);
    for (const [k, max, ms] of [
      [batch ? "import:*" : "*", batch ? 20 : 2, 1000],
      [batch ? "import:" + actor : actor, batch ? 20 : 5, 60000],
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
      distance_context: {
        observation_id: p.observation_id ?? null,
        observed_at: p.observed_at,
        accuracy_m: p.accuracy_m,
        accuracy_permission: p.accuracy_permission,
        valid_until: new Date(Date.parse(p.observed_at) + 20000).toISOString(),
      },
    };
    if (!provider) {
      freshObservation(body);
      await this.accounts.get(a);
      return base;
    }
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
      // A known boundary is not proof that every enclosed roof shares its
      // postal address/access scope. Resolve suggestions before address dedupe.
      const points = buildings.items;
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
        // A catalog point can be outside the driver's 200m query while a
        // Mapbox roof of the same property is nearby. Reuse the existing exact
        // postal + 250m spatial matcher; proximity alone never binds a code.
        const matches =
          key && address
            ? await this.apartments.matchSearchAddress(a, address, b.point)
            : [];
        const linked = matches.length === 1 ? matches[0]! : null;
        items.push({
          key: linked?.id ?? randomUUID(),
          source: "mapbox",
          apartment: linked,
          address: linked
            ? {
                address_line1: linked.address_line1,
                city: linked.city,
                state: linked.state,
                postal_code: linked.postal_code,
              }
            : address,
          point: b.point,
          ...(b.feature_id ? { provider_feature_id: b.feature_id } : {}),
          distance_m: b.distance_m,
          distance_basis: b.distance_basis,
          classification: "apartments",
          requires_address_confirmation: !linked,
        });
      }
      freshObservation(body);
      await this.accounts.get(a);
      return {
        ...base,
        // An atomic same-origin bundle prevents cached provider distances from
        // being mixed with a newer catalog observation on the mobile client.
        items: [...catalog, ...items]
          .sort(
            (x, y) =>
              x.distance_m - y.distance_m ||
              Number(!!y.apartment) - Number(!!x.apartment) ||
              (
                addressIdentity(x.address) ??
                x.provider_feature_id ??
                `${x.point.lng},${x.point.lat}`
              ).localeCompare(
                addressIdentity(y.address) ??
                  y.provider_feature_id ??
                  `${y.point.lng},${y.point.lat}`,
              ),
          )
          .filter(
            (x, i, all) =>
              all.findIndex(
                (c) =>
                  (c.apartment?.id ?? c.key) === (x.apartment?.id ?? x.key),
              ) === i,
          )
          .slice(0, 20),
        truncated:
          base.truncated ||
          buildings.truncated ||
          points.length > 4 ||
          catalog.length + items.length > 20,
        provider_status: "ok",
        attribution: "© Mapbox © OpenStreetMap",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) throw e;
      await this.accounts.get(a);
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
  async prepareImportAddress(a: VerifiedIdentity, address: S["SearchAddress"]) {
    // Import owns the account/capability and catalog checks on its transaction.
    // Opening another sensitive connection here could exhaust the pool.
    this.addressBudget(a.userId, true);
    return this.maps.permanent(address);
  }
}
