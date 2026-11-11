import type { HomeMapProps } from "./HomeMap.types";
import { PreviewMap } from "@abasong/web-map";
export default function HomeMap(props: HomeMapProps = {}) {
  void props; // Native markers/camera are verified in development builds, not this web fallback.
  return <PreviewMap token={process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim()} />;
}
