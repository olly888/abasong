import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { localTarget } from "../d0/database-target";
// Exercise the compiled production matcher against the caller's disposable DB,
// using the constrained sensitive role. This makes no external Mapbox requests.
export async function verifySearchMatching(
  db: Client,
  url: string,
  actor: string,
  issuedAt: number,
) {
  const target = new URL(url);
  const guard = new URL(target);
  guard.pathname = "/abasong_d0";
  localTarget(guard.href);
  assert(
    /^abasong_d1_library_test_[a-f0-9]{16}$/.test(target.pathname.slice(1)),
  );
  const pool = new Pool({ connectionString: target.href, max: 1 });
  const savedProvider = process.env.DATA_ENCRYPTION_PROVIDER,
    savedKey = process.env.LOCAL_DATA_KEK;
  process.env.DATA_ENCRYPTION_PROVIDER = "local-development";
  process.env.LOCAL_DATA_KEK = randomBytes(32).toString("hex");
  const require = createRequire(__filename);
  const { ApartmentsService } =
    require("../../apps/api/dist/apartments/apartments.service.js") as {
      ApartmentsService: new (db: {
        connect: () => ReturnType<Pool["connect"]>;
      }) => {
        matchSearchAddress: (
          actor: { userId: string; issuedAt: number },
          address: {
            address_line1: string;
            city: string;
            state: string;
            postal_code: null;
          } | null,
          point: { lng: number; lat: number },
        ) => Promise<Array<{ id: string }>>;
      };
    };
  const service = new ApartmentsService({ connect: () => pool.connect() });
  try {
    const source = randomUUID(),
      one = randomUUID(),
      two = randomUUID(),
      identity = { userId: actor, issuedAt };
    await db.query(
      "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic','isolated search test',true)",
      [source],
    );
    const insert = async (id: string) =>
      db.query(
        "INSERT INTO abasong.apartments(id,name,address_line1,city,state,source_id,point,status) VALUES($1,'TEST search','2445 E Del Mar Blvd','Pasadena','CA',$2,'SRID=4326;POINT(-118.5 34.5)'::extensions.geography,'active')",
        [id, source],
      );
    await insert(one);
    const address = {
        address_line1: "2445 East Del Mar Boulevard",
        city: "Pasadena",
        state: "CA",
        postal_code: null,
      },
      point = { lng: -118.5, lat: 34.5 };
    assert.deepEqual(
      (await service.matchSearchAddress(identity, address, point)).map(
        (p) => p.id,
      ),
      [one],
    );
    for (const change of [
      { address_line1: "2446 E Del Mar Blvd" },
      { city: "Los Angeles" },
      { address_line1: "2445 E Del Mar Blvd Apt 2" },
    ])
      assert.deepEqual(
        await service.matchSearchAddress(
          identity,
          { ...address, ...change },
          point,
        ),
        [],
      );
    assert.deepEqual(
      await service.matchSearchAddress(identity, address, {
        lng: -118.2,
        lat: 34.14,
      }),
      [],
    );
    await insert(two);
    assert.equal(
      (await service.matchSearchAddress(identity, address, point)).length,
      2,
    );
    await db.query(
      "UPDATE abasong.apartments SET status='pending' WHERE id=$1",
      [two],
    );
    assert.equal(
      (await service.matchSearchAddress(identity, address, point)).length,
      1,
    );
    assert.deepEqual(
      await service.matchSearchAddress(identity, null, point),
      [],
    );
    console.log(
      "PASS: 8 compiled address-matcher/PostGIS checks; exact address, distance, ambiguity and active catalog only",
    );
  } finally {
    await pool.end();
    if (savedProvider === undefined)
      delete process.env.DATA_ENCRYPTION_PROVIDER;
    else process.env.DATA_ENCRYPTION_PROVIDER = savedProvider;
    if (savedKey === undefined) delete process.env.LOCAL_DATA_KEK;
    else process.env.LOCAL_DATA_KEK = savedKey;
  }
}
