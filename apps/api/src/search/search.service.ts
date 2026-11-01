import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { MeService } from "../me/me.service";
import { ApartmentsService } from "../apartments/apartments.service";
import { MapboxSearchProvider } from "./mapbox-search.provider";
type S = components["schemas"];
type Detail = Awaited<ReturnType<MapboxSearchProvider["retrieve"]>>;
type SearchSession = {
  expires: number;
  providerToken: string;
  ids: Set<string>;
  calls: number;
  retrieved?: { id: string; promise: Promise<Detail> };
  timer: ReturnType<typeof setTimeout>;
};
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        ![...s].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127),
    );
const suggestInput = z
  .object({
    query: text(200).refine((s) => s.length >= 2),
    session_token: z.string().uuid(),
  })
  .strict();
const retrieveInput = z
  .object({ provider_result_id: text(500), session_token: z.string().uuid() })
  .strict();
const expired = () =>
  new ApiError(409, "SEARCH_SESSION_EXPIRED", "搜索已更新，请重新选择地址");
@Injectable()
export class SearchService {
  private sessions = new Map<string, SearchSession>();
  private rates = new Map<string, { until: number; count: number }>();
  constructor(
    @Inject(MapboxSearchProvider)
    private readonly provider: MapboxSearchProvider,
    @Inject(MeService) private readonly accounts: MeService,
    @Inject(ApartmentsService) private readonly apartments: ApartmentsService,
  ) {}
  private input<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new ApiError(400, "INVALID_INPUT", "请检查搜索内容");
    return r.data;
  }
  private rate(actor: string) {
    const now = Date.now();
    for (const [k, v] of this.rates) if (v.until <= now) this.rates.delete(k);
    for (const [key, max, ms] of [
      ["global", 8, 1000],
      [actor, 60, 60000],
    ] as const) {
      const item = this.rates.get(key) ?? { until: now + ms, count: 0 };
      if (item.count >= max || this.rates.size >= 2000)
        throw new ApiError(
          429,
          "SEARCH_RATE_LIMITED",
          "搜索较频繁，请稍后重试",
        );
      item.count++;
      this.rates.set(key, item);
    }
  }
  private session(key: string, create: boolean) {
    const previous = this.sessions.get(key);
    if (previous && previous.expires > Date.now()) return previous;
    if (previous) {
      clearTimeout(previous.timer);
      this.sessions.delete(key);
    }
    if (!create) throw expired();
    if (this.sessions.size >= 1000)
      throw new ApiError(429, "SEARCH_RATE_LIMITED", "搜索较繁忙，请稍后重试");
    const timer = setTimeout(() => this.sessions.delete(key), 150000);
    timer.unref();
    const next: SearchSession = {
      expires: Date.now() + 150000,
      providerToken: randomUUID(),
      ids: new Set(),
      calls: 0,
      timer,
    };
    this.sessions.set(key, next);
    return next;
  }
  async suggest(
    actor: VerifiedIdentity,
    body: unknown,
  ): Promise<S["AddressSuggestions"]> {
    const b = this.input(suggestInput, body);
    await this.accounts.get(actor);
    this.rate(actor.userId);
    const s = this.session(actor.userId + ":" + b.session_token, true);
    if (s.retrieved || s.calls >= 45) throw expired();
    s.calls++;
    const result = await this.provider.suggest(b.query, s.providerToken);
    await this.accounts.get(actor);
    if (s.expires <= Date.now() || s.retrieved) throw expired();
    for (const item of result.items) s.ids.add(item.provider_result_id);
    return { ...result, session_token: b.session_token, use_mode: "temporary" };
  }
  async retrieve(
    actor: VerifiedIdentity,
    body: unknown,
  ): Promise<S["TemporaryAddress"]> {
    const b = this.input(retrieveInput, body);
    await this.accounts.get(actor);
    const s = this.session(actor.userId + ":" + b.session_token, false);
    if (
      !s.ids.has(b.provider_result_id) ||
      (s.retrieved && s.retrieved.id !== b.provider_result_id)
    )
      throw expired();
    if (!s.retrieved) {
      this.rate(actor.userId);
      s.retrieved = {
        id: b.provider_result_id,
        promise: this.provider.retrieve(b.provider_result_id, s.providerToken),
      };
    }
    const detail = await s.retrieved.promise;
    await this.accounts.get(actor);
    if (s.expires <= Date.now()) throw expired();
    const apartments = await this.apartments.matchSearchAddress(
      actor,
      detail.address,
      detail.point,
    );
    return {
      label: detail.label,
      title: detail.title,
      point: detail.point,
      attribution: detail.attribution,
      use_mode: "temporary",
      apartments,
      match_status:
        apartments.length === 1
          ? "matched"
          : apartments.length > 1
            ? "ambiguous"
            : "unmatched",
    };
  }
  onModuleDestroy() {
    for (const s of this.sessions.values()) clearTimeout(s.timer);
    this.sessions.clear();
    this.rates.clear();
  }
}
