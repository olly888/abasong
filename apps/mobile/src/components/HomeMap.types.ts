import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type HomeMapProps = {
  point?: S["Point"];
  location?: S["Point"];
  apartments?: S["Apartment"][];
  selectedId?: string;
  mapContext?: S["ApartmentMapContext"] | null;
  onSelect?: (p: S["Apartment"]) => void;
  cameraRevision?: number;
  bottomInset?: number;
};
