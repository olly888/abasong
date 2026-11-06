import type { components } from "@abasong/contracts";
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
  value: string;
  scope: string;
  issues: string[];
  target: S["Apartment"] | null;
  selected: boolean;
  revision: number;
  privateId?: string;
  privateVersion?: number;
  shared?: boolean;
  status?: "private_saved" | "pending" | "active" | "same_value" | "failed";
  error?: string;
};
