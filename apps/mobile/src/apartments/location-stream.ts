import * as Location from "expo-location";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import type { ForegroundFix } from "./foreground-location";

// Foreground only. The owner disposes on blur/background; native Android also
// stops itself on Activity background. Coordinates are never logged/persisted.
export async function watchDevicePosition(
  onFix: (fix: ForegroundFix, approximate: boolean) => void,
  onError: (reason: string) => void,
  signal: AbortSignal,
  ask: boolean,
): Promise<void> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (signal.aborted) return;
  if (ask && !permission.granted && permission.canAskAgain)
    permission = await Location.requestForegroundPermissionsAsync();
  if (signal.aborted) return;
  if (!permission.granted) {
    onError(permission.canAskAgain ? "permission" : "blocked");
    return;
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    if (!signal.aborted) onError("services_off");
    return;
  }
  const approximate =
    permission.ios?.accuracy === "reduced" ||
    permission.android?.accuracy === "coarse";
  const receive = (fix: ForegroundFix) => {
    if (!signal.aborted) onFix(fix, approximate);
  };
  if (Platform.OS !== "android") {
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 0,
        timeInterval: 2000,
      },
      receive,
      () => {
        if (!signal.aborted) onError("unavailable");
      },
    );
    if (signal.aborted) sub.remove();
    else signal.addEventListener("abort", () => sub.remove(), { once: true });
    return;
  }
  const native = requireOptionalNativeModule<{
    startWatch: (id: string) => Promise<void>;
    stopWatch: (id: string) => Promise<void>;
    addListener: (
      event: string,
      listener: (value: {
        id: string;
        fix?: ForegroundFix;
        error?: string;
      }) => void,
    ) => { remove: () => void };
  }>("AbasongLocation");
  if (!native) throw new Error("location_module_unavailable");
  const id = randomUUID();
  const listener = native.addListener("position", (event) => {
    if (event.id !== id || signal.aborted) return;
    if (event.fix) receive(event.fix);
    else onError(event.error ?? "unavailable");
  });
  const stop = () => {
    listener.remove();
    void native.stopWatch(id).catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (!signal.aborted) await native.startWatch(id);
    if (signal.aborted) stop();
  } catch (error) {
    signal.removeEventListener("abort", stop);
    stop();
    throw error;
  }
}
