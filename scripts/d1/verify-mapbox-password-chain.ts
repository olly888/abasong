import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
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
type Accounts = { get(a: Actor): Promise<S["Me"]> };
type Discovery = {
  discover(
    a: Actor,
    b: unknown,
    provider: boolean,
  ): Promise<S["NearbyDiscovery"]>;
};
// Compiled production services and real PostgreSQL. Only the external Mapbox
// transport is synthetic. Never run against D0 itself or any cloud database.
export async function verifyMapboxPasswordChain(
  db: Client,
  apartments: Service,
  writer: Actor,
  reader: Actor,
) {
  assert.match(
    (await db.query("SELECT current_database() AS n")).rows[0].n,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const require = createRequire(__filename);
  const { NearbyService } =
    require("../../apps/api/dist/nearby/nearby.service.js") as {
      NearbyService: new (a: Service, m: Accounts, p: Maps) => Discovery;
    };
  const { MapboxNearbyProvider } =
    require("../../apps/api/dist/nearby/mapbox-nearby.provider.js") as {
      MapboxNearbyProvider: new (transport: typeof fetch) => Maps;
    };
  const { MeService } = require("../../apps/api/dist/me/me.service.js") as {
    MeService: new (d: {
      pool: {
        connect: () => Promise<{ query: Client["query"]; release: () => void }>;
      };
    }) => Accounts;
  };
  // Account lifecycle uses the real implementation. Metadata reads use the
  // harness connection; password methods retain the caller's restricted pool.
  const accounts = new MeService({
    pool: {
      connect: async () => ({
        query: db.query.bind(db),
        release: () => {},
      }),
    },
  });
  for (const a of [writer, reader])
    await db.query(
      "INSERT INTO abasong.profiles(user_id,display_name) VALUES($1,'TEST chain') ON CONFLICT DO NOTHING",
      [a.userId],
    );
  const origin = { lng: -118.6, lat: 34.4 };
  const project = async (m: number): Promise<S["Point"]> => {
    const p = (
      await db.query(
        `WITH p AS (SELECT extensions.ST_Project(
      extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,
      $3::double precision,0::double precision)::extensions.geometry AS g)
      SELECT extensions.ST_X(g) AS lng,extensions.ST_Y(g) AS lat FROM p`,
        [origin.lng, origin.lat, m],
      )
    ).rows[0];
    return { lng: Number(p.lng), lat: Number(p.lat) };
  };
  const roof = await project(150),
    stored = await project(300),
    far = await project(700);
  const address: S["SearchAddress"] = {
    address_line1: "700 TEST Mapbox Chain Ave",
    city: "TEST Mapbox Chain City",
    state: "CA",
    postal_code: null,
  };
  const submitted = await apartments.contributeAddress(
    writer,
    {
      address,
      method: "keypad",
      value: "TEST-CHAIN#",
      scope: { label: "TEST gate" },
      source_attested: true,
      address_confirmed: true,
    },
    randomUUID(),
    { point: stored, address },
  );
  const aid = submitted.apartment.id;
  const before = process.env.MAPBOX_SEARCH_TOKEN;
  process.env.MAPBOX_SEARCH_TOKEN = "pk.TEST-OFFLINE-CHAIN";
  let calls = 0,
    checks = 0;
  const check = async (id: string, run: () => Promise<void>) => {
    try {
      await run();
      checks++;
    } catch {
      throw Error("MAPBOX_CHAIN_" + id);
    }
  };
  const discovery = (
    suggestion: S["SearchAddress"] = address,
    point = roof,
    distance = 150,
  ) => {
    const maps = new MapboxNearbyProvider((async (input: unknown) => {
      calls++;
      const u = new URL(String(input));
      assert.equal(u.hostname, "api.mapbox.com");
      if (u.pathname.includes("/tilequery/"))
        return Response.json({
          features: [
            {
              id: 900001,
              geometry: { coordinates: [point.lng, point.lat] },
              properties: { type: "apartments", tilequery: { distance } },
            },
          ],
        });
      assert.equal(u.pathname, "/search/geocode/v6/reverse");
      const [number, ...street] = suggestion.address_line1.split(" ");
      return Response.json({
        features: [
          {
            geometry: { coordinates: [point.lng, point.lat] },
            properties: {
              feature_type: "address",
              context: {
                address: {
                  address_number: number,
                  street_name: street.join(" "),
                },
                place: { name: suggestion.city },
                region: { region_code: "US-" + suggestion.state },
                country: { country_code: "US" },
              },
            },
          },
        ],
      });
    }) as typeof fetch);
    return new NearbyService(apartments, accounts, maps);
  };
  const fix = (point = origin) => ({
    point,
    observed_at: new Date().toISOString(),
    accuracy_m: 5,
    accuracy_permission: "precise",
  });
  try {
    await check("CATALOG_RADIUS", async () => {
      assert(
        !(await apartments.discoverCatalog(reader, origin)).some(
          (c) => c.apartment?.id === aid,
        ),
      );
    });
    await check("EXACT_LINK_NO_SECRET", async () => {
      const result = await discovery().discover(reader, fix(), true);
      assert.equal(result.provider_status, "ok");
      assert.equal(result.items[0]?.apartment?.id, aid);
      assert.equal(result.items[0]?.requires_address_confirmation, false);
      assert.equal(result.items[0]?.provider_feature_id, "900001");
      assert.equal(result.items[0]?.point.lng, roof.lng);
      assert(!JSON.stringify(result).includes("TEST-CHAIN#"));
      assert(!JSON.stringify(result).includes("access_records"));
    });
    await check("AUTHORIZED_CODE", async () => {
      const result = await apartments.readShared(reader, aid, {});
      assert(
        result.items.some(
          (r) => r.value === "TEST-CHAIN#" && r.apartment_id === aid,
        ),
      );
    });
    await check("WRONG_DOOR", async () => {
      const result = await discovery({
        ...address,
        address_line1: "702 TEST Mapbox Chain Ave",
      }).discover(reader, fix(), true);
      assert.equal(result.items[0]?.apartment, null);
      assert.equal(result.items[0]?.requires_address_confirmation, true);
    });
    await check("FAR_SAME_ADDRESS", async () => {
      const result = await discovery(address, far, 0).discover(
        reader,
        fix(far),
        true,
      );
      assert.equal(result.items[0]?.apartment, null);
    });
    await check("REVOKED_READER", async () => {
      await db.query(
        "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='access.read'",
        [reader.userId],
      );
      await assert.rejects(apartments.readShared(reader, aid, {}), {
        status: 403,
      });
      const result = await discovery().discover(reader, fix(), true);
      assert.equal(result.items[0]?.apartment?.id, aid);
      assert(!JSON.stringify(result).includes("TEST-CHAIN#"));
    });
    await check("AMBIGUOUS", async () => {
      await db.query(
        `INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,point,source_id,status,confidence)
        SELECT $1,'TEST duplicate',address_line1,city,state,postal_code,point,source_id,status,confidence
        FROM abasong.apartments WHERE id=$2`,
        [randomUUID(), aid],
      );
      const result = await discovery().discover(reader, fix(), true);
      assert.equal(result.items[0]?.apartment, null);
      assert.equal(result.items[0]?.requires_address_confirmation, true);
    });
    await check("ACCOUNT_BLOCKED", async () => {
      await db.query(
        "UPDATE abasong.users SET status='suspended' WHERE id=$1",
        [reader.userId],
      );
      const previous = calls;
      await assert.rejects(discovery().discover(reader, fix(), true), {
        status: 403,
        code: "ACCOUNT_SUSPENDED",
      });
      assert.equal(calls, previous);
    });
    console.log(
      JSON.stringify({
        suite: "mapbox-password-chain",
        checks,
        transport: "synthetic",
        database: "isolated-postgis",
      }),
    );
  } finally {
    if (before === undefined) delete process.env.MAPBOX_SEARCH_TOKEN;
    else process.env.MAPBOX_SEARCH_TOKEN = before;
  }
}
