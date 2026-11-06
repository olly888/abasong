import { expect, it } from "vitest";
import {
  deliveryInput,
  hydrateDelivery,
} from "../../apps/mobile/src/requests/delivery-fields";
import { deliveryFixture } from "../../apps/mobile/src/requests/delivery-fixtures";
import { checked } from "../../apps/api/src/requests/request-input";
import {
  draftV2Input,
  patchV2Input,
  prepareV2Publication,
} from "../../apps/api/src/requests/request-v2-input";
const now = Date.parse("2026-11-06T18:00:00Z");
for (const scenario of ["warehouse_shortage", "delivery_handoff"] as const) {
  for (const quantityMode of ["exact", "estimate", "unknown"] as const) {
    it(`accepts the native ${scenario}/${quantityMode} payload through actual server normalization`, () => {
      const f = hydrateDelivery(
        deliveryFixture(scenario, now),
        false,
        now,
      ).fields;
      f.quantityMode = quantityMode;
      if (quantityMode === "unknown") f.quantity = "";
      f.customExpiry = false;
      const input = deliveryInput(scenario, f, true, null, now);
      const draft = checked(draftV2Input, input);
      const published = prepareV2Publication(draft, now);
      expect(published.quantity_mode).toBe(quantityMode);
      expect(published.remaining_parcels).toBe(
        quantityMode === "exact" ? 150 : null,
      );
      expect(published.pickup?.kind).toBe(
        scenario === "warehouse_shortage" ? "warehouse" : "contact_handoff",
      );
      const { scenario: _scenario, ...fields } = input;
      void _scenario;
      expect(
        checked(patchV2Input, { ...fields, expected_version: 3 }),
      ).toMatchObject({ request_schema_version: 2, expected_version: 3 });
    });
  }
}
