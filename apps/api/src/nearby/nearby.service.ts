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
    const p = freshObservation(body),
      started = Date.now();
    if (p.expand && !provider)
      throw new ApiError(400, "INVALID_INPUT", "扩围需使用附近地图查询");
    await this.accounts.get(a);
    const initial = await this.apartments.discoverCatalog(a, p.point);
    let result: S["NearbyDiscovery"] = {
      items: initial,
      radius_m: 200,
      expires_at: new Date(Date.now() + 20000).toISOString(),
      truncated: initial.length === 20,
      provider_status: "not_requested",
      attribution: "",
      use_mode: "temporary",
      coverage: {
        catalog: initial.length === 20 ? "capped" : "queried",
        mapbox: "not_requested",
      },
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
      return result;
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
    // One cycle owns one origin, one rate-limit lease and one finite budget.
    const budget = {
      signal: AbortSignal.timeout(Math.max(1, 8000 - (Date.now() - started))),
      tilequery_requests: 0,
      metadata_requests: 0,
    };
    const expansion: S["NearbyExpansion"] = {
      attempted_radii_m: [200],
      stop_reason: "fixed",
      catalog_queries: 1,
      tilequery_requests: 0,
      reverse_requests: 0,
      metadata_requests: 0,
      elapsed_ms: 0,
    };
    const suggestions = new Map<
      string,
      {
        address: S["SearchAddress"] | null;
        linked: S["Apartment"] | null;
        failed: boolean;
        key: string;
      }
    >();
    for (const radius of p.expand
      ? ([200, 500, 1000] as const)
      : ([200] as const)) {
      if (p.expand && (budget.signal.aborted || Date.now() - started >= 8000)) {
        expansion.stop_reason = "budget_exhausted";
        result = {
          ...result,
          provider_status: "unavailable",
          coverage: {
            catalog: result.coverage!.catalog,
            mapbox: "unavailable",
          },
        };
        break;
      }
      if (radius !== 200) expansion.attempted_radii_m.push(radius);
      try {
        freshObservation(body);
        let catalog = initial;
        if (radius !== 200) {
          expansion.catalog_queries++;
          catalog = await this.apartments.discoverCatalog(a, p.point, radius);
        }
        const buildings = await this.maps.buildings(
          p.point,
          radius,
          p.expand ? budget : undefined,
        );
        const points = buildings.items;
        const items: S["NearbyCandidate"][] = [];
        const seen = new Set(
          catalog.map((c) => addressIdentity(c.address)).filter(Boolean),
        );
        let incomplete =
          buildings.truncated ||
          (p.expand && buildings.extent_complete !== true);
        // Four distinct reverse requests per cycle, memoized only until return.
        const candidates = points.slice(0, 4);
        if (points.length > candidates.length) incomplete = true;
        const suggested = await Promise.all(
          candidates.map(async (b) => {
            const id = b.feature_id ?? `${b.point.lng},${b.point.lat}`;
            let cached = suggestions.get(id);
            if (!cached) {
              if (expansion.reverse_requests >= 4) {
                incomplete = true;
                return { b, cached: null };
              }
              expansion.reverse_requests++;
              let address: S["SearchAddress"] | null = null,
                failed = false;
              try {
                address = await this.maps.reverse(
                  b.point,
                  p.expand ? budget.signal : undefined,
                );
              } catch {
                failed = true;
              }
              // Missing address also requires human confirmation; no nearby guess.
              if (!address) failed = true;
              const key = addressIdentity(address);
              const matches =
                key && address && !seen.has(key)
                  ? await this.apartments.matchSearchAddress(
                      a,
                      address,
                      b.point,
                    )
                  : [];
              cached = {
                address,
                linked: matches.length === 1 ? matches[0]! : null,
                failed,
                key: randomUUID(),
              };
              suggestions.set(id, cached);
            }
            return { b, cached };
          }),
        );
        for (const { b, cached } of suggested) {
          if (!cached) continue;
          if (cached.failed) incomplete = true;
          const { address, linked } = cached,
            key = addressIdentity(address);
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          items.push({
            key: linked?.id ?? cached.key,
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
        const merged = [...catalog, ...items]
          .filter((c) => c.distance_m >= 0 && c.distance_m <= radius)
          .sort(
            (x, y) =>
              x.distance_m - y.distance_m ||
              Number(!!y.apartment) - Number(!!x.apartment) ||
              (
                addressIdentity(x.address) ??
                x.provider_feature_id ??
                x.key
              ).localeCompare(
                addressIdentity(y.address) ?? y.provider_feature_id ?? y.key,
              ),
          )
          .filter(
            (x, i, all) =>
              all.findIndex(
                (c) =>
                  (c.apartment?.id ?? c.key) === (x.apartment?.id ?? x.key),
              ) === i,
          );
        if (p.expand && budget.signal.aborted)
          throw new ApiError(503, "DISCOVERY_TIMEOUT", "附近资料暂时无法加载");
        freshObservation(body);
        await this.accounts.get(a);
        result = {
          ...result,
          radius_m: radius,
          items: merged.slice(0, 20),
          truncated: catalog.length === 20 || incomplete || merged.length > 20,
          provider_status: "ok",
          attribution: "© Mapbox © OpenStreetMap",
          coverage: {
            catalog: catalog.length === 20 ? "capped" : "queried",
            mapbox: incomplete ? "partial" : "queried",
          },
          expires_at: new Date(Date.now() + 60000).toISOString(),
        };
        if (!p.expand) break;
        if (incomplete) {
          expansion.stop_reason = "coverage_incomplete";
          break;
        }
        if (merged.length >= 3) {
          expansion.stop_reason = "sufficient";
          break;
        }
        expansion.stop_reason = "max_radius";
      } catch (e) {
        // Never downgrade revoked identity or expired location to usable data.
        if (e instanceof ApiError && [401, 403, 404, 409].includes(e.status))
          throw e;
        freshObservation(body);
        await this.accounts.get(a);
        expansion.stop_reason = budget.signal.aborted
          ? "budget_exhausted"
          : "provider_unavailable";
        result = {
          ...result,
          items: p.expand ? result.items : [],
          provider_status: "unavailable",
          coverage: {
            catalog: result.coverage!.catalog,
            mapbox: "unavailable",
          },
        };
        break;
      }
    }
    freshObservation(body);
    await this.accounts.get(a);
    return {
      ...result,
      ...(p.expand
        ? {
            expansion: {
              ...expansion,
              tilequery_requests: budget.tilequery_requests,
              metadata_requests: budget.metadata_requests,
              elapsed_ms: Math.max(0, Date.now() - started),
            },
          }
        : {}),
    };
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
