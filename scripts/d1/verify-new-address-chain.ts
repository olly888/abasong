import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import type { Service } from "./verify-nearby";
type S = components["schemas"];
type Actor = { userId: string; issuedAt: number };

// Uses compiled services and a disposable local database, never D0 or cloud.
// Live mode makes at most ONE permanent request for an official public property.
// The caller drops the entire database, including the permitted result and TEST code.
export async function verifyNewAddressChain(
  db: Client,
  apartments: Service,
  writer: Actor,
) {
  assert.match(
    (await db.query("SELECT current_database() AS n")).rows[0].n,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const live = process.env.ABASONG_VERIFY_LIVE_PERMANENT === "1";
  const address: S["SearchAddress"] = live
    ? {
        address_line1: "145 Chestnut St",
        city: "Pasadena",
        state: "CA",
        postal_code: "91103",
      }
    : {
        address_line1: "800 TEST NewAddress Ave",
        city: "TEST NewAddress City",
        state: "CA",
        postal_code: "90000",
      };
  assert.equal(
    (await apartments.findConfirmedAddress(writer, address)).length,
    0,
  );
  const reader = { userId: randomUUID(), issuedAt: writer.issuedAt };
  await db.query("INSERT INTO abasong.users(id) VALUES($1)", [reader.userId]);
  await db.query(
    "INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST new address reader')",
    [reader.userId],
  );
  const require = createRequire(__filename);
  const { MeService } = require("../../apps/api/dist/me/me.service.js") as {
    MeService: new (d: {
      pool: {
        connect: () => Promise<{ query: Client["query"]; release: () => void }>;
      };
    }) => { get(a: Actor): Promise<S["Me"]> };
  };
  type Maps = {
    permanent(
      a: S["SearchAddress"],
    ): Promise<{ point: S["Point"]; address: S["SearchAddress"] }>;
  };
  const { MapboxNearbyProvider } =
    require("../../apps/api/dist/nearby/mapbox-nearby.provider.js") as {
      MapboxNearbyProvider: new (t: typeof fetch) => Maps;
    };
  const { NearbyService } =
    require("../../apps/api/dist/nearby/nearby.service.js") as {
      NearbyService: new (
        a: Service,
        m: { get(a: Actor): Promise<S["Me"]> },
        p: Maps,
      ) => {
        contribute(
          a: Actor,
          b: unknown,
          key: string,
        ): Promise<S["AddressContributionResult"]>;
      };
    };
  const accounts = new MeService({
    pool: {
      connect: async () => ({ query: db.query.bind(db), release: () => {} }),
    },
  });
  const before = {
    token: process.env.MAPBOX_SEARCH_TOKEN,
    enabled: process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED,
  };
  const body: S["AddressContributionInput"] = {
    address,
    method: "keypad",
    value: "#001234*",
    scope: { label: "TEST gate" },
    source_attested: true,
    address_confirmed: true,
  };
  let calls = 0,
    liveCalls = 0,
    mode: "success" | "failure" | "mismatch" = "success",
    checks = 0;
  const count = async () =>
    Number(
      (await db.query("SELECT count(*) AS n FROM abasong.apartments")).rows[0]
        .n,
    );
  const initialCount = await count();
  const maps = new MapboxNearbyProvider((async (
    input: unknown,
    init?: RequestInit,
  ) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(u.origin, "https://api.mapbox.com");
    assert.equal(u.pathname, "/search/geocode/v6/forward");
    assert.equal(u.searchParams.get("permanent"), "true");
    if (mode === "failure") return new Response("TEST", { status: 503 });
    if (live && mode === "success") {
      assert(++liveCalls <= 1, "Permanent request budget exceeded");
      return fetch(u, init);
    }
    const [number, ...street] = address.address_line1.split(" ");
    return Response.json({
      features: [
        {
          geometry: { type: "Point", coordinates: [-118.55, 34.45] },
          properties: {
            feature_type: "address",
            coordinates: { accuracy: "rooftop" },
            match_code: {
              confidence: "exact",
              address_number: "matched",
              street: "matched",
              region: "matched",
            },
            context: {
              address: {
                address_number: mode === "mismatch" ? "999" : number,
                street_name: street.join(" "),
              },
              place: { name: address.city },
              region: { region_code: "US-CA" },
              country: { country_code: "US" },
              postcode: { name: address.postal_code },
            },
          },
        },
      ],
    });
  }) as typeof fetch);
  const service = () => new NearbyService(apartments, accounts, maps);
  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
      checks++;
    } catch {
      throw Error("NEW_ADDRESS_" + name);
    }
  };
  try {
    process.env.MAPBOX_SEARCH_TOKEN = live
      ? parseEnv(readFileSync(".env", "utf8")).MAPBOX_SEARCH_TOKEN?.trim()
      : "pk.TEST-NEW-ADDRESS";
    assert(process.env.MAPBOX_SEARCH_TOKEN?.startsWith("pk."));
    process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED = "false";
    await check("DISABLED_NO_WRITE", async () => {
      await assert.rejects(service().contribute(writer, body, randomUUID()), {
        code: "ADDRESS_STORAGE_UNAVAILABLE",
      });
      assert.equal(calls, 0);
      assert.equal(await count(), initialCount);
    });
    process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED = "true";
    await check("QUALIFICATION_BEFORE_PROVIDER", async () => {
      await assert.rejects(service().contribute(reader, body, randomUUID()), {
        code: "CAPABILITY_REQUIRED",
      });
      assert.equal(calls, 0);
    });
    await check("CONFIRMATION_REQUIRED", async () => {
      await assert.rejects(
        service().contribute(
          writer,
          { ...body, address_confirmed: false },
          randomUUID(),
        ),
        { code: "INVALID_INPUT" },
      );
      assert.equal(calls, 0);
    });
    mode = "failure";
    await check("PROVIDER_FAILURE_NO_WRITE", async () => {
      await assert.rejects(service().contribute(writer, body, randomUUID()), {
        code: "ADDRESS_STORAGE_UNAVAILABLE",
      });
      assert.equal(await count(), initialCount);
    });
    mode = "mismatch";
    await check("WRONG_DOOR_NO_WRITE", async () => {
      await assert.rejects(service().contribute(writer, body, randomUUID()), {
        code: "ADDRESS_CONFIRMATION_REQUIRED",
      });
      assert.equal(await count(), initialCount);
    });
    mode = "success";
    const nearby = service(),
      key = randomUUID();
    let result: S["AddressContributionResult"];
    await check("CONFIRMED_DIRECT_SHARE", async () => {
      result = await nearby.contribute(writer, body, key);
      assert.equal(result.contribution.outcome, "created_active");
      assert.equal(result.apartment.address_line1, address.address_line1);
      assert.equal(await count(), initialCount + 1);
      const source = (
        await db.query(
          "SELECT s.source_type,s.product,s.persistent_use_approved FROM abasong.apartments a JOIN abasong.data_sources s ON s.id=a.source_id WHERE a.id=$1",
          [result.apartment.id],
        )
      ).rows[0];
      assert.deepEqual(source, {
        source_type: "provider_permanent",
        product: "geocoding-v6-permanent",
        persistent_use_approved: true,
      });
    });
    const callsAfterWrite = calls;
    await check("LOST_RESPONSE_RETRY", async () => {
      assert.deepEqual(await nearby.contribute(writer, body, key), result!);
      assert.equal(calls, callsAfterWrite);
      assert.equal(await count(), initialCount + 1);
    });
    await check("SAME_KEY_CHANGED_PAYLOAD", async () => {
      await assert.rejects(
        nearby.contribute(writer, { ...body, value: "*004321#" }, key),
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      assert.equal(calls, callsAfterWrite);
    });
    await check("CROSS_ACCOUNT_READ", async () => {
      await db.query(
        "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.read','TEST new address')",
        [reader.userId],
      );
      const records = await apartments.readShared(
        reader,
        result!.apartment.id,
        {},
      );
      assert(
        records.items.some(
          (r) =>
            r.value === body.value && r.apartment_id === result!.apartment.id,
        ),
      );
    });
    await check("DISCOVERY_REUSES_NEW_ADDRESS", async () => {
      const cards = await apartments.discoverCatalog(
        reader,
        result!.apartment.point!,
      );
      assert.equal(
        cards.filter((c) => c.apartment?.id === result!.apartment.id).length,
        1,
      );
      assert(!JSON.stringify(cards).includes(body.value));
    });
    await check("REVOKED_READER", async () => {
      await db.query(
        "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='access.read'",
        [reader.userId],
      );
      await assert.rejects(
        apartments.readShared(reader, result!.apartment.id, {}),
        { status: 403 },
      );
    });
    console.log(
      `PASS: new-address chain ${checks} checks; ${live ? "live permanent public property" : "synthetic provider"}; permanent API calls ${liveCalls}; no real-account grants`,
    );
  } finally {
    if (before.token === undefined) delete process.env.MAPBOX_SEARCH_TOKEN;
    else process.env.MAPBOX_SEARCH_TOKEN = before.token;
    if (before.enabled === undefined)
      delete process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED;
    else process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED = before.enabled;
  }
}
