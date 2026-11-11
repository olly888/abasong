import { describe, expect, it } from "vitest";
import type { components } from "@abasong/contracts";
import { buildingCamera } from "./building-camera";
type Building =
  components["schemas"]["ApartmentMapContext"]["buildings"][number];
const padding = {
  paddingTop: 164,
  paddingBottom: 222,
  paddingLeft: 24,
  paddingRight: 24,
};
function building(
  west: number,
  east: number,
  south = 34,
  north = 34.001,
): Building {
  return {
    id: "test",
    street_number: "TEST",
    verified_at: "2026-10-31T00:00:00Z",
    label_point: { lng: west, lat: south },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      ],
    },
  };
}
describe("selected building camera", () => {
  it("fits every footprint inside the unobscured width instead of cutting off a large apartment", () => {
    const result = buildingCamera(
      [building(-118.004, -118), building(-117.999, -117.998)],
      390,
      700,
      padding,
    )!;
    expect(result.zoomLevel).toBeLessThan(17);
    const projectedWidth = (0.006 / 360) * 512 * 2 ** result.zoomLevel;
    expect(projectedWidth).toBeLessThanOrEqual(390 - 48 + 1e-6);
    expect(result.centerCoordinate[0]).toBeCloseTo(-118.001, 6);
  });
  it("reduces zoom for a taller card/smaller visible height", () => {
    const b = [building(-118.001, -118, 34, 34.006)];
    expect(buildingCamera(b, 390, 650, padding)!.zoomLevel).toBeLessThan(
      buildingCamera(b, 390, 900, padding)!.zoomLevel,
    );
  });
  it("caps detail zoom for a tiny footprint", () => {
    expect(
      buildingCamera(
        [building(-118.00001, -118, 34, 34.00001)],
        390,
        700,
        padding,
      )!.zoomLevel,
    ).toBe(18);
  });
  it("leaves address-only, invalid and obscured viewports to the location camera", () => {
    expect(buildingCamera([], 390, 700, padding)).toBeNull();
    expect(buildingCamera([building(-118, NaN)], 390, 700, padding)).toBeNull();
    expect(
      buildingCamera([building(-118.001, -118)], 390, 200, padding),
    ).toBeNull();
  });
});
