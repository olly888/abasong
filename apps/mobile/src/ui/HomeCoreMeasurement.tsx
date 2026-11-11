import { createContext } from "react";
import type { VerticalBox } from "./home-core-visibility";

// Per-row native core geometry. Cards outside the home list need no reporter.
export const HomeCoreMeasurement = createContext<
  ((box: VerticalBox) => void) | undefined
>(undefined);
