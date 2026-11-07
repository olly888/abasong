import { deliveryFixture } from "../requests/delivery-fixtures";
import { hydrateDelivery, deliveryInput } from "../requests/delivery-fields";
export function collaborationSeed(f: { region: string; pickup: string }) {
  const seed = deliveryFixture("warehouse_shortage");
  seed.region_id = f.region;
  seed.pickup_region_id = f.pickup;
  if (seed.pickup?.kind === "warehouse")
    seed.pickup = {
      ...seed.pickup,
      address_line1: "100 TEST Ave",
      city: "TEST City",
      postal_code: "90000",
      address_source: "provider_permanent",
    };
  const fields = hydrateDelivery(seed, true).fields;
  fields.route = "TEST R4-12";
  return deliveryInput(seed.scenario, fields, true);
}
