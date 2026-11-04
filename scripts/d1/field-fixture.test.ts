import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const data = JSON.parse(
  readFileSync("apps/mobile/src/field/woodside.public.json", "utf8"),
) as {
  buildings: unknown;
  status: string;
  license: string;
  gates: Array<{
    id: string;
    field_verified: boolean;
    status: string;
    point: { lng: number; lat: number };
  }>;
};
it("embedded review geometry stays identical to the licensed public source and all gates remain candidates", () => {
  const source = JSON.parse(
    readFileSync("data/public-apartments/la-expansion.geojson", "utf8"),
  );
  const gates = JSON.parse(
    readFileSync(
      "data/public-apartments/woodside-entrance-candidates.geojson",
      "utf8",
    ),
  );
  expect(data.buildings).toEqual(
    source.features.find(
      (f: { properties: { slug: string } }) =>
        f.properties.slug === "woodside-village",
    ).geometry,
  );
  expect(data.status).toBe("candidate_only");
  expect(data.license).toContain("odbl");
  expect(data.gates.map((g) => g.id)).toEqual(["G1", "G2"]);
  for (const g of data.gates) {
    const s = gates.features.find(
      (f: { properties: { sample_id: string } }) =>
        f.properties.sample_id === "woodside-" + g.id,
    );
    expect(g.field_verified).toBe(false);
    expect(g.status).toBe("candidate");
    expect([g.point.lng, g.point.lat]).toEqual(s.geometry.coordinates);
  }
});
