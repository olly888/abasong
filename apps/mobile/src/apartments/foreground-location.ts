export type ForegroundPermission = {
  granted: boolean;
  canAskAgain: boolean;
  ios?: { accuracy?: string };
  android?: { accuracy?: string };
};
export type ForegroundFix = {
  coords: { longitude: number; latitude: number; accuracy: number | null };
  timestamp: number;
};
export type ForegroundResult =
  | { status: "permission"; blocked: boolean }
  | { status: "services_off" }
  | { status: "fix"; fix: ForegroundFix; approximate: boolean };

// Adapter keeps device permission/location separate from apartment API failures.
// Callers invalidate late results; the OS fix itself is not cancellable.
export async function acquireForegroundLocation(
  device: {
    permission: () => Promise<ForegroundPermission>;
    request: () => Promise<ForegroundPermission>;
    enabled: () => Promise<boolean>;
    fix: () => Promise<ForegroundFix>;
  },
  ask: boolean,
  timeoutMs = 20_000,
): Promise<ForegroundResult> {
  let permission = await device.permission();
  if (ask && !permission.granted && permission.canAskAgain)
    permission = await device.request();
  if (!permission.granted)
    return { status: "permission", blocked: !permission.canAskAgain };
  if (!(await device.enabled())) return { status: "services_off" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fix = await Promise.race([
    device.fix(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("location_timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !Number.isFinite(fix.coords.longitude) ||
    !Number.isFinite(fix.coords.latitude) ||
    Math.abs(fix.coords.longitude) > 180 ||
    Math.abs(fix.coords.latitude) > 90 ||
    !Number.isFinite(fix.timestamp)
  )
    throw new Error("invalid_location");
  if (Date.now() - fix.timestamp > 20_000 || fix.timestamp > Date.now() + 1000)
    throw new Error("location_timeout");
  return {
    status: "fix",
    fix,
    approximate:
      permission.ios?.accuracy === "reduced" ||
      permission.android?.accuracy === "coarse",
  };
}
