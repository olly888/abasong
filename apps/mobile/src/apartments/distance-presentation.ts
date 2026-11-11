import type { components } from "@abasong/contracts";
import type { DiscoveryObservation } from "./nearby-policy";
import {
  distanceM,
  isFreshDiscoveryObservation,
  observationPoint,
} from "./nearby-policy";
type S = components["schemas"];
export type DistanceReference = {
  context: S["DistanceContext"];
  origin: S["Point"];
};
export type NearbyCardCandidate = S["NearbyCandidate"] & {
  distance_reference?: DistanceReference;
};
// Geometric proximity only. Never manufacture 0, a gate distance or travel time.
export function distanceHint(
  candidate: NearbyCardCandidate | undefined,
  observation: DiscoveryObservation | null,
  now = Date.now(),
): string | null {
  if (observation?.approximate) return "位置较粗略";
  const r = candidate?.distance_reference,
    context = r?.context;
  if (
    !r ||
    !context ||
    !observation ||
    !candidate?.distance_basis ||
    ![
      "address_point",
      "community_boundary",
      "building_footprint",
      "building_point_upper_bound",
    ].includes(candidate.distance_basis)
  )
    return null;
  if (context.accuracy_permission !== "precise") return "位置较粗略";
  const observed = Date.parse(context.observed_at),
    until = Date.parse(context.valid_until),
    distance = candidate.distance_m;
  if (
    !isFreshDiscoveryObservation(observation, now) ||
    !Number.isFinite(observed) ||
    !Number.isFinite(until) ||
    observed > now + 1000 ||
    until <= now ||
    until > observed + 20000 ||
    !Number.isFinite(context.accuracy_m) ||
    context.accuracy_m < 0 ||
    context.accuracy_m > 100 ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    distanceM(r.origin, observationPoint(observation)) > 15
  )
    return null;
  // A 50–100m fix can discover candidates, but is too coarse for a 5m label.
  if (
    context.accuracy_m > 50 ||
    (observation.fix.coords.accuracy ?? Infinity) > 50
  )
    return "位置较粗略";
  if (distance < 10) return "10 m内";
  if (distance >= 1000) return `约${(distance / 1000).toFixed(1)} km`;
  return `约${Math.round(distance / 5) * 5} m`;
}
