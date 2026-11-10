import type { components } from "@abasong/contracts";
import type { CarrierDoorLabel } from "./extract";
type S = components["schemas"];
export type Source = {
  width?: number;
  height?: number;
  bytes?: number;
  mime?: "image/png" | "image/jpeg" | "image/heic";
  id: string;
  uri: string;
  state: "selected" | "processing" | "recognized" | "failed";
  error?: string;
};
export type Candidate = {
  id: string;
  sourceId: string;
  address: string;
  /** Independent OCR/user text, never a temporary map-selection result. */
  sourceAddress?: string;
  value: string;
  scope: string;
  carrierDoorLabel?: CarrierDoorLabel;
  issues: string[];
  target: S["Apartment"] | null;
  confirmedAddress?: S["SearchAddress"] | null;
  sharedApartmentId?: string;
  needsAddressReview?: boolean;
  selected: boolean;
  revision: number;
  privateId?: string;
  privateVersion?: number;
  shared?: boolean;
  status?: "private_saved" | "pending" | "active" | "same_value" | "failed";
  error?: string;
};

export type ImportPreparationFailure = {
  stage: "address_preparation";
  error_code: string;
  retryable: boolean;
};
export type ImportOutcome = S["ImportCommitResult"] | ImportPreparationFailure;
