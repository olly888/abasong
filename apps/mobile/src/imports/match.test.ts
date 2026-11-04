import { expect, it } from "vitest";
import { exactApartment } from "./match";
const p = {
  id: "1",
  name: null,
  address_line1: "100 Example Ave",
  city: "Test City",
  state: "CA",
  postal_code: null,
  point: { lng: 0, lat: 0 },
  confidence: "unverified" as const,
};
it("requires street, city, state and one unique match", () => {
  expect(exactApartment("100 Example Ave", [p])).toBeNull();
  expect(
    exactApartment("100 Example Ave, Other City, CA 90001", [p]),
  ).toBeNull();
  expect(
    exactApartment("100 Example Ave, Other Test City, CA 90001", [p]),
  ).toBeNull();
  expect(exactApartment("100 Example Ave, Test City, CA 90001", [p])).toEqual(
    p,
  );
  expect(
    exactApartment("100 Example Ave, Test City, CA 90001", [
      p,
      { ...p, id: "2" },
    ]),
  ).toBeNull();
});

it("does not preselect when a known postal code conflicts", () => {
  expect(
    exactApartment("100 Example Ave, Test City, CA 90001", [
      { ...p, postal_code: "90000" },
    ]),
  ).toBeNull();
});
