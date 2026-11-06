import { expect, it, vi } from "vitest";
import type { components } from "@abasong/contracts";
import {
  createContributionAddressSearch,
  validContributionAddress,
  privateAddressText,
  type ContributionRequest,
} from "./contribution-address-search";
type S = components["schemas"];
it("warehouse search uses only provider APIs and the selected suggestion session", async () => {
  const request = vi.fn(async (path: string) =>
    path.endsWith("/suggest")
      ? { items: [suggestion], attribution: "TEST" }
      : detail,
  );
  const search = createContributionAddressSearch(
    request as ContributionRequest,
    () => "TEST-session",
    Date.now,
    false,
  );
  const choices = (await search.search("2445"))!;
  await search.retrieve({ kind: "address", suggestion }, choices);
  expect(request.mock.calls.map(([p]) => p)).toEqual([
    "/v1/search/addresses/suggest",
    "/v1/search/addresses/retrieve",
  ]);
});
const address = {
  address_line1: "2445 E Del Mar Blvd",
  city: "Pasadena",
  state: "CA",
  postal_code: "91107",
};
const apartment: S["Apartment"] = {
  id: "11111111-1111-4111-8111-111111112445",
  name: "TEST Apartments",
  ...address,
  point: { lng: -118.1, lat: 34.1 },
  confidence: "unverified",
};
const suggestion: S["AddressSuggestion"] = {
  provider_result_id: "TEST:2445",
  title: address.address_line1,
  subtitle: "Pasadena CA",
  label: "TEST address",
  address,
};
const detail: S["TemporaryAddress"] = {
  address,
  label: "TEST address",
  title: "TEST",
  point: apartment.point,
  use_mode: "temporary",
  attribution: "TEST provider",
  match_status: "unmatched",
  apartments: [],
};
function fixture(
  override?: (
    path: string,
    options: Parameters<ContributionRequest>[1],
  ) => Promise<unknown>,
) {
  let key = 0,
    clock = 1000;
  const request = vi.fn(
    async (path: string, options?: Parameters<ContributionRequest>[1]) => {
      if (override) return override(path, options);
      if (path.includes("?")) return { items: [apartment] };
      if (path.endsWith("/suggest"))
        return { items: [suggestion], attribution: "TEST provider" };
      return detail;
    },
  );
  return {
    request,
    search: createContributionAddressSearch(
      request as ContributionRequest,
      () => `TEST-key-${++key}`,
      () => clock,
    ),
    advance: (n: number) => (clock += n),
  };
}
it("does not fetch a directory for empty/one-character input; deduplicates exact postal candidates", async () => {
  const f = fixture();
  expect(await f.search.search("")).toBeNull();
  expect(await f.search.search("2")).toBeNull();
  expect(f.request).not.toHaveBeenCalled();
  const result = await f.search.search("2445");
  expect(result?.items).toEqual([{ kind: "apartment", apartment }]);
  expect(f.request.mock.calls[0]?.[0]).toContain("limit=5&query=2445");
});
it("keeps provider results after catalog failure, and catalog results after provider failure", async () => {
  const provider = fixture(async (path) => {
    if (path.includes("?")) throw new Error("TEST offline");
    return { items: [suggestion], attribution: "TEST" };
  });
  expect(await provider.search.search("2445")).toMatchObject({
    localUnavailable: true,
    providerUnavailable: false,
    items: [{ kind: "address", suggestion }],
  });
  const catalog = fixture(async (path) => {
    if (path.endsWith("/suggest")) throw new Error("TEST offline");
    return { items: [apartment] };
  });
  expect(await catalog.search.search("2445")).toMatchObject({
    localUnavailable: false,
    providerUnavailable: true,
    items: [{ kind: "apartment", apartment }],
  });
});
it("drops an older response even when the transport ignores cancellation", async () => {
  const finish: ((v: unknown) => void)[] = [];
  let calls = 0;
  const f = fixture(async (path) => {
    if (calls++ < 2) return new Promise((resolve) => finish.push(resolve));
    return path.includes("?")
      ? { items: [apartment] }
      : { items: [], attribution: "" };
  });
  const old = f.search.search("old TEST");
  const latest = await f.search.search("2445");
  finish.forEach((resolve) => resolve({ items: [], attribution: "" }));
  expect(await old).toBeNull();
  expect(latest?.items).toHaveLength(1);
});
it("retrieves with the suggestion session, retries the same result safely, and rotates after consumption", async () => {
  let retrieves = 0;
  const f = fixture(async (path) => {
    if (path.includes("?")) return { items: [] };
    if (path.endsWith("/suggest"))
      return { items: [suggestion], attribution: "TEST" };
    if (++retrieves === 1) throw new Error("TEST transient");
    return detail;
  });
  const choices = (await f.search.search("2445"))!;
  const choice = { kind: "address" as const, suggestion };
  await expect(f.search.retrieve(choice, choices)).rejects.toThrow(
    "TEST transient",
  );
  expect(await f.search.retrieve(choice, choices)).toEqual(detail);
  const bodies = f.request.mock.calls
    .filter(([p]) => p.endsWith("/retrieve"))
    .map(([, o]) => o?.body);
  expect(bodies).toEqual(
    Array(2).fill({
      provider_result_id: suggestion.provider_result_id,
      session_token: choices.token,
    }),
  );
  expect((await f.search.search("385"))!.token).not.toBe(choices.token);
});
it("rejects expired choices before a retrieve request and starts a fresh session", async () => {
  const f = fixture();
  const choices = (await f.search.search("2445"))!;
  f.advance(140001);
  await expect(
    f.search.retrieve({ kind: "address", suggestion }, choices),
  ).rejects.toThrow("过期");
  expect(f.request).toHaveBeenCalledTimes(2);
  expect((await f.search.search("2445"))!.token).not.toBe(choices.token);
});
it("ignores a late retrieve failure after address editing or screen disposal", async () => {
  let reject!: (e: Error) => void;
  const f = fixture(async (path) =>
    path.endsWith("/retrieve")
      ? new Promise((_, no) => (reject = no))
      : { items: [suggestion], attribution: "TEST" },
  );
  const choices = (await f.search.search("2445"))!;
  const late = f.search.retrieve({ kind: "address", suggestion }, choices);
  f.search.cancel();
  reject(new Error("TEST late failure"));
  expect(await late).toBeNull();
});
it("requires a complete explicit shared postal address while preserving the private-only free-text path", () => {
  expect(validContributionAddress({ kind: "pending" }, false)).toBe(false);
  expect(
    validContributionAddress(
      { kind: "address", address: { ...address, city: "" } },
      false,
    ),
  ).toBe(false);
  expect(
    validContributionAddress(
      { kind: "private", address: "TEST private address" },
      false,
    ),
  ).toBe(false);
  expect(
    validContributionAddress(
      { kind: "private", address: "TEST private address" },
      true,
    ),
  ).toBe(true);
  expect(validContributionAddress({ kind: "address", address }, false)).toBe(
    true,
  );
  expect(privateAddressText({ kind: "address", address })).toBe(
    "2445 E Del Mar Blvd, Pasadena, CA, 91107",
  );
});
