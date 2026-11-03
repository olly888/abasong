import type { ReactNode } from "react";
import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type HomeMapProps = {
  point?: S["Point"];
  destination?: S["Point"];
  location?: S["Point"];
  apartments?: S["Apartment"][];
  selectedId?: string;
  mapContext?: S["ApartmentMapContext"] | null;
  onSelect?: (p: S["Apartment"]) => void;
  selectedPoint?: S["Point"];
  providerFeatureId?: string;
  nearbyCandidates?: S["NearbyCandidate"][];
  onNearbySelect?: (candidate: S["NearbyCandidate"]) => void;
  cameraRevision?: number;
  cameraIntent?: "explicit" | "arrival";
  cameraZoom?: number;
  frameSelected?: boolean;
  bottomInset?: number;
  topInset?: number;
  overlay?: ReactNode;
  /** Development-only synthetic native SDK acceptance, never a product input. */
  testMapStyle?: string;
  onTestBuildingResult?: (key: string, count: number) => void;
};
