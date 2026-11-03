import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { addressIdentity } from "../../packages/contracts/src/index";
import { mergeNearby } from "../../apps/mobile/src/apartments/nearby-policy";
import { publicExpansion } from "./public-apartment-data";
import type { Service } from "./verify-nearby";
type S = components["schemas"];
type Actor = { userId: string; issuedAt: number };
type Maps = {
  buildings(p: S["Point"]): Promise<{
    items: { point: S["Point"]; distance_m: number; feature_id?: string }[];
    truncated: boolean;
  }>;
  reverse(p: S["Point"]): Promise<S["SearchAddress"] | null>;
};

// Explicit opt-in only. The caller owns a disposable local test database.
// Live provider data remains in this process; only independent licensed fixture
// addresses and synthetic TEST contributions are written to the disposable DB.
export async function verifyLiveNearby(
  db: Client,
  apartments: Service,
  writer: Actor,
) {
  assert.match(
    (await db.query("SELECT current_database() AS n")).rows[0].n,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const token = parseEnv(
    readFileSync(".env", "utf8"),
  ).MAPBOX_SEARCH_TOKEN?.trim();
  assert(token?.startsWith("pk."), "Public token unavailable");
  const require = createRequire(__filename);
  const { MapboxNearbyProvider } =
    require("../../apps/api/dist/nearby/mapbox-nearby.provider.js") as {
      MapboxNearbyProvider: new (t: typeof fetch) => Maps;
    };
  const { MeService } = require("../../apps/api/dist/me/me.service.js") as {
    MeService: new (d: {
      pool: {
        connect: () => Promise<{ query: Client["query"]; release: () => void }>;
      };
    }) => { get(a: Actor): Promise<S["Me"]> };
  };
  const { NearbyService } =
    require("../../apps/api/dist/nearby/nearby.service.js") as {
      NearbyService: new (
        a: Service,
        m: { get(a: Actor): Promise<S["Me"]> },
        p: Maps,
      ) => {
        discover(
          a: Actor,
          b: S["ResolveInput"],
          provider?: boolean,
        ): Promise<S["NearbyDiscovery"]>;
      };
    };
  const reader: Actor = { userId: randomUUID(), issuedAt: writer.issuedAt };
  await db.query("INSERT INTO abasong.users(id) VALUES($1)", [reader.userId]);
  await db.query(
    "INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST live reader')",
    [reader.userId],
  );
  await db.query(
    "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.read','TEST disposable live suite')",
    [reader.userId],
  );
  const accounts = new MeService({
    pool: {
      connect: async () => ({ query: db.query.bind(db), release: () => {} }),
    },
  });
  const before = process.env.MAPBOX_SEARCH_TOKEN;
  process.env.MAPBOX_SEARCH_TOKEN = token;
  let calls = 0,
    lastId = "";
  const countBefore = Number(
    (await db.query("SELECT count(*) AS n FROM abasong.apartments")).rows[0].n,
  );
  try {
    for (const slug of ["del-mar", "woodside-village", "colony-at-the-lakes"]) {
      let stage = "fixture";
      try {
        const id = publicExpansion.find((p) => p.slug === slug)!.id;
        const row = (
          await db.query(
            `SELECT address_line1,city,state,postal_code,
          extensions.ST_X(point::extensions.geometry) AS lng,extensions.ST_Y(point::extensions.geometry) AS lat
          FROM abasong.apartments WHERE id=$1`,
            [id],
          )
        ).rows[0];
        const address: S["SearchAddress"] = {
          address_line1: row.address_line1,
          city: row.city,
          state: row.state,
          postal_code: row.postal_code,
        };
        const point: S["Point"] = {
          lng: Number(row.lng),
          lat: Number(row.lat),
        };
        const fix = (): S["ResolveInput"] => ({
          point,
          observed_at: new Date().toISOString(),
          accuracy_m: 5,
          accuracy_permission: "precise",
        });
        const start = calls;
        const maps = new MapboxNearbyProvider((async (input, options) => {
          assert(calls < 27, "Provider budget exceeded");
          calls++;
          const u = new URL(String(input));
          assert.equal(u.origin, "https://api.mapbox.com");
          assert.notEqual(u.searchParams.get("permanent"), "true");
          return fetch(input, options);
        }) as typeof fetch);
        // Independent samples, not a load test or proof of cross-instance rate limits.
        const discovery = new NearbyService(apartments, accounts, maps);
        stage = "live-discovery";
        const catalog = await discovery.discover(writer, fix());
        const extra = await discovery.discover(writer, fix(), true);
        stage = "candidate-invariants";
        assert.equal(extra.provider_status, "ok");
        const cards = mergeNearby(catalog.items, extra.items);
        assert(cards.some((c) => c.apartment?.id === id));
        assert(cards.every((c) => c.distance_m >= 0 && c.distance_m <= 200));
        assert.equal(
          new Set(cards.map((c) => c.apartment?.id ?? c.key)).size,
          cards.length,
        );
        const providerAddresses = extra.items
          .map((c) => addressIdentity(c.address))
          .filter(Boolean);
        assert.equal(new Set(providerAddresses).size, providerAddresses.length);
        assert(
          extra.items.every(
            (c) => c.apartment || c.requires_address_confirmation,
          ),
        );
        const body = {
          method: "keypad" as const,
          value: "TEST-LIVE-CHAIN#",
          scope: { label: "TEST live suite" },
          source_attested: true as const,
        };
        stage = "contribute-selected-id";
        // The earlier matcher fixture intentionally leaves a far duplicate
        // postal address. A driver selecting a known card contributes by ID;
        // do not weaken the address-only ambiguity guard to accommodate a test.
        const published = await apartments.contribute(
          writer,
          id,
          body,
          randomUUID(),
        );
        assert(published.record_id);
        stage = "authorized-read";
        const records = await apartments.readShared(reader, id, {});
        assert(
          records.items.some(
            (r) => r.value === body.value && r.apartment_id === id,
          ),
        );
        assert(!JSON.stringify({ catalog, extra }).includes(body.value));
        const wrong = {
          ...address,
          address_line1: address.address_line1.replace(/^\d+/, (n) =>
            String(Number(n) + 1),
          ),
        };
        stage = "wrong-door-and-no-registration";
        assert.equal(
          (await apartments.matchSearchAddress(writer, wrong, point)).length,
          0,
        );
        assert.equal(
          Number(
            (await db.query("SELECT count(*) AS n FROM abasong.apartments"))
              .rows[0].n,
          ),
          countBefore,
        );
        lastId = id;
        console.log(
          JSON.stringify({
            suite: "live-mapbox-postgis",
            sample: slug,
            passed: true,
            catalog_cards: catalog.items.length,
            additional_cards: extra.items.length,
            merged_cards: cards.length,
            truncated: extra.truncated,
            provider_calls: calls - start,
          }),
        );
      } catch {
        console.error(
          JSON.stringify({
            suite: "live-mapbox-postgis",
            sample: slug,
            passed: false,
            stage,
          }),
        );
        throw Error("Live provider/PG check failed; sensitive details omitted");
      }
    }
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1",
      [reader.userId],
    );
    await assert.rejects(apartments.readShared(reader, lastId, {}), {
      status: 403,
    });
    console.log(
      JSON.stringify({
        suite: "live-mapbox-postgis",
        samples: 3,
        provider_calls: calls,
        max_provider_calls: 27,
        revoked_reader_denied: true,
        provider_data_persisted: false,
        database: "disposable-local-only",
      }),
    );
  } finally {
    if (before === undefined) delete process.env.MAPBOX_SEARCH_TOKEN;
    else process.env.MAPBOX_SEARCH_TOKEN = before;
  }
}
