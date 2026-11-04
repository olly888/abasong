import { expect, it } from "vitest";
import {
  selectedBuildingGeometry,
  candidateForBuilding,
  featureId,
} from "./building-query";
import type { components } from "@abasong/contracts";
type C = components["schemas"]["NearbyCandidate"];
const outer = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
  hole = [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.8, 0.8],
    [0.2, 0.8],
    [0.2, 0.2],
  ];
const feature = (id = 1, coordinates = [outer, hole]) => ({
  type: "Feature",
  id,
  properties: { type: "apartments", private_name: "TEST omitted" },
  geometry: { type: "Polygon", coordinates },
});
const collection = (...features: unknown[]) => ({
  type: "FeatureCollection",
  features,
});
const target = { key: "TEST", point: { lng: 0.1, lat: 0.1 } };
const candidate = (key: string): C => ({
  key,
  source: "mapbox",
  apartment: null,
  address: null,
  point: target.point,
  distance_m: 10,
  classification: "apartments",
  requires_address_confirmation: true,
});
it("reads Polygon/MultiPolygon and strips supplier properties", () => {
  const selected = selectedBuildingGeometry(collection(feature()), target);
  expect(selected.features).toHaveLength(1);
  expect(JSON.stringify(selected)).not.toContain("private_name");
  expect(
    selectedBuildingGeometry(
      collection({
        ...feature(),
        geometry: { type: "MultiPolygon", coordinates: [[outer, hole]] },
      }),
      target,
    ).features,
  ).toHaveLength(1);
});
it("preserves courtyards, closed edges and exact supplier identity without guessing another roof", () => {
  expect(
    selectedBuildingGeometry(collection(feature()), {
      ...target,
      point: { lng: 0.5, lat: 0.5 },
    }).features,
  ).toHaveLength(0);
  expect(
    selectedBuildingGeometry(collection(feature()), {
      ...target,
      point: { lng: 0.2, lat: 0.5 },
    }).features,
  ).toHaveLength(1);
  expect(
    selectedBuildingGeometry(collection(feature()), {
      ...target,
      featureId: "2",
    }).features,
  ).toHaveLength(0);
  expect(
    selectedBuildingGeometry(collection(feature()), {
      ...target,
      featureId: "1",
    }).features,
  ).toHaveLength(1);
});
it("refuses overlapping identities and deduplicates repeated tile fragments", () => {
  expect(
    selectedBuildingGeometry(collection(feature(1), feature(2)), target)
      .features,
  ).toHaveLength(0);
  expect(
    selectedBuildingGeometry(collection(feature(1), feature(1)), target)
      .features,
  ).toHaveLength(1);
});
it("refuses invalid/unclosed/unbounded geometry and building parts", () => {
  for (const f of [
    feature(1, [
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    ]),
    feature(1, [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 0],
      ],
    ]),
    { ...feature(), properties: { type: "building:part" } },
    feature(1, [
      [
        [999, 0],
        [1, 0],
        [1, 1],
        [999, 0],
      ],
    ]),
  ])
    expect(
      selectedBuildingGeometry(collection(f), target).features,
    ).toHaveLength(0);
  expect(selectedBuildingGeometry(null, target).features).toHaveLength(0);
});
it("selects only one existing candidate, preserving independent address ambiguity", () => {
  const a = { ...candidate("TEST-a"), provider_feature_id: "1" },
    b = { ...candidate("TEST-b"), provider_feature_id: "2" };
  expect(candidateForBuilding(collection(feature(1)), [a, b])?.key).toBe(
    "TEST-a",
  );
  expect(
    candidateForBuilding(collection(feature(1)), [a, candidate("TEST-c")]),
  ).toBeUndefined();
  expect(candidateForBuilding(collection(feature(3)), [a, b])).toBeUndefined();
});
it("does not convert unsafe or control-character feature IDs", () => {
  expect(featureId(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
  expect(featureId("x\n")).toBeUndefined();
  expect(featureId(0)).toBe("0");
});
