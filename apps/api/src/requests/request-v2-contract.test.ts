import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";
import { expect, it } from "vitest";
type Schema = {
  properties?: Record<string, Schema>;
  enum?: unknown[];
  required?: string[];
  nullable?: boolean;
  description?: string;
  [key: string]: unknown;
};
const contract = JSON.parse(
  execFileSync("python3", ["scripts/generate_v12_openapi.py", "--json"], {
    encoding: "utf8",
  }),
) as {
  components: { schemas: Record<string, Schema> };
  paths: Record<string, unknown>;
};
const s = contract.components.schemas;
it("source-generated contract and checked-in TypeScript agree without mutating generated files", async () => {
  const generated = astToString(
    await openapiTS(contract as unknown as Parameters<typeof openapiTS>[0]),
  );
  const checkedIn = readFileSync("packages/contracts/src/generated.ts", "utf8");
  expect(checkedIn.slice(checkedIn.indexOf("export interface paths"))).toBe(
    generated.slice(generated.indexOf("export interface paths")),
  );
}, 15000);
it("keeps full pickup detail separate from public/list/source and rejects coordinate input", () => {
  for (const name of [
    "RequestSummaryV2",
    "PublicRequestSummaryV2",
    "RequestVersionV2",
  ]) {
    for (const key of [
      "pickup",
      "point",
      "address_line1",
      "city",
      "postal_code",
      "private_payment_terms",
      "contact_phone",
      "wechat",
    ])
      expect(s[name]!.properties).not.toHaveProperty(key);
  }
  expect(s.RequestDetailV2!.properties).toHaveProperty("pickup");
  expect(s.WarehousePickupDetailV2!.properties).toHaveProperty("point");
  expect(s.WarehousePickupDraftV2!.properties).not.toHaveProperty("point");
  expect(s.WarehousePickupDraftV2!.properties).not.toHaveProperty(
    "provider_result_id",
  );
  expect(s.ContactHandoffV2!.properties).toEqual({
    kind: { type: "string", enum: ["contact_handoff"] },
  });
});
it("routes explicit V2 while preserving strict legacy models and nullable unknown quantities", () => {
  expect(s.RequestDraftInputV2!.required).toEqual([
    "request_schema_version",
    "scenario",
  ]);
  expect(s.RequestDraftInputV2!.properties!.parcel_count!.nullable).toBe(true);
  expect(s.RequestSummaryV2!.properties!.handoff_date!.nullable).toBe(true);
  expect(s.RequestDraftInputV2!["x-implementation-stage"]).toBe(
    "R4-07-local-service",
  );
  expect(s.RequestDraftInput!.properties).not.toHaveProperty(
    "request_schema_version",
  );
  expect(JSON.stringify(contract.paths)).toContain("RequestDraftAny");
  expect(JSON.stringify(contract.paths)).toContain("request_schema_version");
  expect(s.RequestDraftInputV2!.properties!.quantity_mode!.enum).toEqual([
    "exact",
    "estimate",
    "unknown",
  ]);
});
