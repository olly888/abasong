import type { DeliveryRequest } from "./presentation";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import type { components } from "@abasong/contracts";
import { applicationInput } from "./application-input";

// The reviewed version is fixed for this sheet, including an uncertain retry.
export function createApplicationAttempt(
  observed: DeliveryRequest,
  request: ContributionRequest,
  key: () => string,
) {
  let busy = false;
  let signature = "";
  let intentKey = "";
  return async (
    current: DeliveryRequest,
    date: string,
    time: string,
    capacity: string,
  ) => {
    if (current.id !== observed.id || current.version !== observed.version)
      throw new Error("需求条件已更新，请查看当前需求后重新报名");
    if (busy) return null;
    const body = applicationInput(observed, date, time, capacity);
    const next = JSON.stringify(body);
    if (signature !== next) {
      signature = next;
      intentKey = key();
    }
    busy = true;
    try {
      return await request<components["schemas"]["Application"]>(
        `/v1/requests/${observed.id}/applications`,
        { method: "POST", body, key: intentKey },
      );
    } finally {
      busy = false;
    }
  };
}
