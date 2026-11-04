import { expect, it } from "vitest";
import { d0CredentialSql, pilotCredentialSql } from "./credential-sql";
const publicFixture =
  "-----BEGIN PGP PUBLIC KEY BLOCK-----\nTEST-ONLY\n-----END PGP PUBLIC KEY BLOCK-----";

it("fixes cloud targets and returns only sealed credentials with transaction failure protection", () => {
  const q = pilotCredentialSql(publicFixture);
  expect(q).toContain("current_database() <> 'postgres'");
  expect(q).toContain("r.rolpassword IS NULL");
  expect(q).toContain("pg_stat_activity");
  expect(q).toContain("SECURITY INVOKER");
  expect(q).toContain("pgp_pub_encrypt(payload::text");
  expect(q).toContain("WHEN query_canceled");
  expect(q).toContain("WHEN others THEN");
  expect(q).not.toContain("SQLERRM");
  expect(q).not.toContain("SECURITY DEFINER");
  expect(q).not.toContain("CREATE ROLE");
});
it("refuses private keys, SQL literal escapes and arbitrary local test targets", () => {
  expect(() =>
    pilotCredentialSql("-----BEGIN PGP PRIVATE KEY BLOCK-----"),
  ).toThrow();
  expect(() => pilotCredentialSql(publicFixture + "'unsafe")).toThrow();
  expect(() => d0CredentialSql(publicFixture, "postgres")).toThrow();
  const local = d0CredentialSql(publicFixture, "0123456789abcdef");
  expect(local).not.toContain("abasong_api_dev");
  expect(local).toContain("abasong_credential_test_0123456789abcdef");
});
