import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Client, Pool } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import type { EnvelopeCrypto } from "../../apps/api/src/encryption/envelope";
import type {
  DataKeyGateway,
  KmsConfig,
} from "../../apps/api/src/encryption/kms-envelope";
import { localTarget } from "../d0/database-target";
type S = components["schemas"];
type Actor = { userId: string; issuedAt: number };
type Db = { connect: () => ReturnType<Pool["connect"]> };
interface Apartments {
  create(a: Actor, b: unknown, k: string): Promise<S["LibraryEntry"]>;
  detail(a: Actor, id: string): Promise<S["LibraryDetail"]>;
  list(a: Actor, q: unknown): Promise<S["LibraryPage"]>;
  patch(
    a: Actor,
    id: string,
    b: unknown,
    k: string,
  ): Promise<S["LibraryEntry"]>;
  createRecord(
    a: Actor,
    id: string,
    b: unknown,
    k: string,
  ): Promise<S["PrivateRecord"]>;
  contribute(
    a: Actor,
    id: string,
    b: unknown,
    k: string,
  ): Promise<S["ContributionResult"]>;
  readShared(a: Actor, id: string, q: unknown): Promise<S["AccessList"]>;
  contributions(a: Actor, q: unknown): Promise<S["ContributionSummaryPage"]>;
  correctContribution(
    a: Actor,
    id: string,
    b: unknown,
    k: string,
  ): Promise<S["ContributionChangeResult"]>;
}
interface Imports {
  create(a: Actor, b: unknown, k: string): Promise<S["ImportBatch"]>;
  detail(a: Actor, id: string): Promise<S["ImportBatch"]>;
  register(
    a: Actor,
    id: string,
    b: unknown,
    k: string,
  ): Promise<S["ImportSource"]>;
  extract(
    a: Actor,
    id: string,
    sid: string,
    b: unknown,
    k: string,
  ): Promise<S["ImportCandidatePage"]>;
  candidates(
    a: Actor,
    id: string,
    q: unknown,
  ): Promise<S["ImportCandidatePage"]>;
}
export async function verifyKmsServices(
  db: Client,
  url: string,
  issuedAt: number,
) {
  const target = new URL(url),
    guard = new URL(url);
  guard.pathname = "/abasong_d0";
  localTarget(guard.href);
  assert(
    /^abasong_d1_library_test_[a-f0-9]{16}$/.test(target.pathname.slice(1)),
  );
  const pool = new Pool({ connectionString: url, max: 3 }),
    require = createRequire(__filename);
  const { KmsEnvelope } =
    require("../../apps/api/dist/encryption/kms-envelope.js") as {
      KmsEnvelope: new (c: KmsConfig, g: DataKeyGateway) => EnvelopeCrypto;
    };
  const { ApartmentsService } =
    require("../../apps/api/dist/apartments/apartments.service.js") as {
      ApartmentsService: new (d: Db, c: EnvelopeCrypto) => Apartments;
    };
  const { ImportsService } =
    require("../../apps/api/dist/imports/imports.service.js") as {
      ImportsService: new (d: Db, a: Apartments, c: EnvelopeCrypto) => Imports;
    };
  const keys = new Map<string, { key: Buffer; context: string }>();
  let fail = false;
  const gateway: DataKeyGateway = {
    async generate(keyArn, context) {
      await new Promise((r) => setTimeout(r, 1));
      if (fail) throw new Error("TEST KMS denied");
      const key = randomBytes(32),
        wrapped = randomBytes(32);
      keys.set(wrapped.toString("hex"), {
        key,
        context: JSON.stringify(context),
      });
      return { plaintext: Buffer.from(key), wrapped, keyId: keyArn };
    },
    async decrypt(keyArn, wrapped, context) {
      await new Promise((r) => setTimeout(r, 1));
      if (fail) throw new Error("TEST KMS denied");
      const found = keys.get(Buffer.from(wrapped).toString("hex"));
      assert(found && found.context === JSON.stringify(context));
      return { plaintext: Buffer.from(found.key), keyId: keyArn };
    },
  };
  const crypto = new KmsEnvelope(
      {
        keyArn:
          "arn:aws:kms:us-west-1:000000000000:key/11111111-1111-4111-8111-111111111111",
        region: "us-west-1",
        environment: "pilot-dev",
        hmacKey: randomBytes(32),
        hmacVersion: "pilot-v1",
      },
      gateway,
    ),
    service = new ApartmentsService({ connect: () => pool.connect() }, crypto),
    imports = new ImportsService(
      { connect: () => pool.connect() },
      service,
      crypto,
    ),
    owner = { userId: randomUUID(), issuedAt },
    reader = { userId: randomUUID(), issuedAt },
    aid = randomUUID(),
    source = randomUUID();
  const previousRetention = process.env.IDEMPOTENCY_RETENTION_SECONDS;
  process.env.IDEMPOTENCY_RETENTION_SECONDS = "3600";
  try {
    await db.query("INSERT INTO abasong.users(id) VALUES($1),($2)", [
      owner.userId,
      reader.userId,
    ]);
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) SELECT u,c,'TEST KMS service' FROM unnest($1::uuid[]) u CROSS JOIN unnest(ARRAY['access.read','access.contribute']) c",
      [[owner.userId, reader.userId]],
    );
    await db.query(
      "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic','TEST KMS integration only',true)",
      [source],
    );
    await db.query(
      "INSERT INTO abasong.apartments(id,address_line1,city,source_id,point,status) VALUES($1,'100 TEST KMS Ave','TEST City',$2,'SRID=4326;POINT(-118.25 34.05)'::extensions.geography,'active')",
      [aid, source],
    );
    const entry = await service.create(
      owner,
      { apartment_id: aid },
      randomUUID(),
    );
    await service.createRecord(
      owner,
      entry.id,
      { value: "0017#", scope_label: "TEST" },
      randomUUID(),
    );
    assert.equal(
      (await service.detail(owner, entry.id)).records[0]?.value,
      "0017#",
    );
    assert.equal((await service.list(owner, {})).items[0]?.id, entry.id);
    await assert.rejects(
      service.detail(reader, entry.id),
      (e) => (e as { status: number }).status === 404,
    );
    const changed = await service.patch(
      owner,
      entry.id,
      { expected_version: entry.version, name: "TEST changed" },
      randomUUID(),
    );
    assert.equal(changed.name, "TEST changed");
    const key = randomUUID(),
      body = {
        method: "keypad",
        value: "0017#",
        scope: { label: "TEST KMS gate" },
        source_attested: true,
      };
    const shared = await service.contribute(owner, aid, body, key);
    assert.equal(
      (await service.contribute(owner, aid, body, key)).record_id,
      shared.record_id,
    );
    assert.equal(
      (await service.readShared(reader, aid, {})).items[0]?.value,
      "0017#",
    );
    const own = (await service.contributions(owner, {})).items[0]!;
    await service.correctContribution(
      owner,
      own.id,
      {
        expected_version: own.version,
        value: "*0018",
        scope: { label: "TEST KMS gate" },
        source_attested: true,
      },
      randomUUID(),
    );
    assert.equal(
      (await service.readShared(reader, aid, {})).items[0]?.value,
      "*0018",
    );
    assert.equal(
      (
        await db.query(
          "SELECT hmac_key_version FROM abasong.access_records WHERE apartment_id=$1",
          [aid],
        )
      ).rows[0].hmac_key_version,
      "pilot-v1",
    );
    const policy = {
      version: 1,
      max_images: 10,
      max_image_bytes: 10485760,
      max_total_bytes: 52428800,
      max_pixels: 24000000,
      draft_ttl_seconds: 86400,
      source_ttl_seconds: 86400,
      upload_ttl_seconds: 900,
      processing_timeout_seconds: 60,
      daily_image_limit: 100,
      max_candidates: 100,
      recognition_mode: "on_device",
      supported_mime_types: ["image/jpeg", "image/png"],
    };
    await db.query(
      "INSERT INTO abasong.config_versions(version,config,activated_at) VALUES(100,$1,now())",
      [{ import_policy: policy }],
    );
    const batch = await imports.create(
      owner,
      {
        client_batch_id: randomUUID(),
        policy_version: 1,
        mode: "private_only",
        origin: "library",
      },
      randomUUID(),
    );
    const image = await imports.register(
      owner,
      batch.id,
      {
        client_source_id: randomUUID(),
        expected_batch_version: batch.version,
        mime_type: "image/png",
        byte_size: 1000,
        width: 100,
        height: 100,
      },
      randomUUID(),
    );
    await imports.extract(
      owner,
      batch.id,
      image.id,
      {
        expected_source_version: image.version,
        recognizer_version: "TEST KMS",
        candidates: [
          {
            address_text: "100 TEST KMS Ave",
            value: "0017#",
            method: "keypad",
            scope: { label: "TEST" },
          },
        ],
      },
      randomUUID(),
    );
    assert.equal(
      (await imports.candidates(owner, batch.id, {})).items[0]?.value,
      "0017#",
    );
    await assert.rejects(
      imports.detail(reader, batch.id),
      (e) => (e as { status: number }).status === 404,
    );
    for (const table of [
      "personal_apartments",
      "personal_access_records",
      "import_batches",
    ]) {
      const rows = await db.query(
        `SELECT payload FROM abasong.${table} WHERE owner_id=$1`,
        [owner.userId],
      );
      assert(rows.rowCount);
      for (const row of rows.rows) {
        assert.equal(row.payload.format, "aws-kms-envelope-v1");
        assert(!JSON.stringify(row.payload).includes("0017#"));
      }
    }
    const count = (
      await db.query(
        "SELECT count(*) FROM abasong.personal_apartments WHERE owner_id=$1",
        [owner.userId],
      )
    ).rows[0].count;
    fail = true;
    await assert.rejects(
      service.create(owner, { address: "TEST must rollback" }, randomUUID()),
      (e) => (e as { status: number }).status === 503,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*) FROM abasong.personal_apartments WHERE owner_id=$1",
          [owner.userId],
        )
      ).rows[0].count,
      count,
    );
    await assert.rejects(
      service.readShared(reader, aid, {}),
      (e) => (e as { status: number }).status === 503,
    );
    await assert.rejects(
      imports.detail(owner, batch.id),
      (e) => (e as { status: number }).status === 503,
    );
    fail = false;
    assert.equal(
      (await imports.candidates(owner, batch.id, {})).items[0]?.value,
      "0017#",
    );
    console.log(
      "PASS: compiled KMS adapter + real PostgreSQL services; async private/shared/import flows, owner isolation, correction/dedup and denied-KMS rollback; synthetic gateway, no AWS calls",
    );
  } catch (error) {
    const e = error as { code?: string; stack?: string };
    console.error(
      "KMS_SERVICE_FAILED",
      /^[A-Z0-9_]{1,40}$/.test(e.code ?? "") ? e.code : "runtime",
      e.stack
        ?.split("\n")
        .find((line) => line.includes("verify-kms-services.ts")) ?? "setup",
    );
    throw error;
  } finally {
    if (previousRetention === undefined)
      delete process.env.IDEMPOTENCY_RETENTION_SECONDS;
    else process.env.IDEMPOTENCY_RETENTION_SECONDS = previousRetention;
    await pool.end();
    for (const v of keys.values()) v.key.fill(0);
  }
}
