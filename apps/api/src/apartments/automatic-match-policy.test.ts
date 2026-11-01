import { describe, expect, it } from "vitest";
import {
  automaticMatchBasis,
  automaticMatchPolicy,
} from "./automatic-match-policy";

const apartmentId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-31T12:00:00Z");
const scope = {
  apartment_id: apartmentId,
  match_bases: ["boundary"],
  evidence_ref: "TEST field record",
  verified_at: "2026-10-31T11:00:00Z",
  expires_at: "2026-11-01T12:00:00Z",
};
const input = { enabled: true, max_accuracy_m: 20, scopes: [scope] };
const inside = {
  id: apartmentId,
  boundary_inside: true,
  entrance_inside: true,
};

describe("scoped automatic recognition", () => {
  it("does not enable the whole catalog using the legacy global flag", () => {
    expect(
      automaticMatchPolicy(
        { enabled: true, max_accuracy_m: 20, evidence_ref: "TEST" },
        now,
      ),
    ).toBeNull();
    expect(automaticMatchPolicy({ ...input, enabled: false }, now)).toBeNull();
    expect(automaticMatchPolicy(undefined, now)).toBeNull();
  });

  it("a building-only validation cannot authorize recognition outside its door", () => {
    const policy = automaticMatchPolicy(input, now);
    expect(automaticMatchBasis(policy, inside)).toBe("boundary");
    expect(
      automaticMatchBasis(policy, { ...inside, boundary_inside: false }),
    ).toBeNull();
    expect(automaticMatchBasis(policy, { ...inside, id: otherId })).toBeNull();
  });

  it("an entrance-only validation cannot authorize the building interior", () => {
    const policy = automaticMatchPolicy(
      { ...input, scopes: [{ ...scope, match_bases: ["entrance"] }] },
      now,
    );
    expect(automaticMatchBasis(policy, inside)).toBe("entrance");
    expect(
      automaticMatchBasis(policy, { ...inside, entrance_inside: false }),
    ).toBeNull();
  });

  it("uses the database clock and treats the expiry instant as expired", () => {
    expect(
      automaticMatchPolicy(input, Date.parse(scope.verified_at)),
    ).not.toBeNull();
    expect(
      automaticMatchPolicy(input, Date.parse(scope.verified_at) - 1),
    ).toBeNull();
    expect(
      automaticMatchPolicy(input, Date.parse(scope.expires_at) - 1),
    ).not.toBeNull();
    expect(
      automaticMatchPolicy(input, Date.parse(scope.expires_at)),
    ).toBeNull();
    expect(automaticMatchPolicy(input, NaN)).toBeNull();
  });

  it("expires one apartment independently while retaining another active scope", () => {
    const policy = automaticMatchPolicy(
      {
        ...input,
        scopes: [
          { ...scope, expires_at: "2026-10-31T12:00:00Z" },
          { ...scope, apartment_id: otherId },
        ],
      },
      now,
    );
    expect(automaticMatchBasis(policy, inside)).toBeNull();
    expect(automaticMatchBasis(policy, { ...inside, id: otherId })).toBe(
      "boundary",
    );
  });

  it("fails closed for ambiguous, unrestricted or malformed scopes", () => {
    for (const scopes of [
      [scope, scope],
      [{ ...scope, apartment_id: "*" }],
      [{ ...scope, match_bases: [] }],
      [{ ...scope, match_bases: ["boundary", "boundary"] }],
      [{ ...scope, evidence_ref: "  " }],
      [{ ...scope, expires_at: undefined }],
      [{ ...scope, expires_at: scope.verified_at }],
      [{ ...scope, override: true }],
    ])
      expect(automaticMatchPolicy({ ...input, scopes }, now)).toBeNull();
  });
});
