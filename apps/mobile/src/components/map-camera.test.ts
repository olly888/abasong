import { expect, it } from "vitest";
import { cameraAt, cameraSnapshot } from "./map-camera";
it("retains full viewport scale/orientation when explicitly focusing a service area or own location", () => {
  const snapshot = cameraSnapshot({
    center: [-118.1, 34.1],
    zoom: 15.5,
    heading: -30,
    pitch: 20,
  })!;
  expect(snapshot.heading).toBe(330);
  expect(cameraAt({ lng: -118.2, lat: 34.2 }, snapshot)).toEqual({
    ...snapshot,
    center: { lng: -118.2, lat: 34.2 },
  });
  expect(snapshot.center).toEqual({ lng: -118.1, lat: 34.1 });
  expect(cameraAt(snapshot.center).zoom).toBe(14);
});
it("rejects incomplete/invalid native snapshots rather than storing an unusable viewport", () => {
  const good = { center: [-118.1, 34.1], zoom: 14, heading: 0, pitch: 0 };
  for (const bad of [
    { center: [] },
    { center: [181, 34] },
    { zoom: NaN },
    { pitch: Infinity },
    { zoom: 22 },
  ])
    expect(cameraSnapshot({ ...good, ...bad })).toBeNull();
});
