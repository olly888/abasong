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
  cameraRevision?: number;
  cameraIntent?: "explicit" | "arrival";
  cameraZoom?: number;
  frameSelected?: boolean;
  bottomInset?: number;
};
