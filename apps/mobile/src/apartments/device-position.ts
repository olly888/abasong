import { Platform } from "react-native";
import * as LegacyLocation from "expo-location";
import { requireOptionalNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import type { ForegroundFix } from "./foreground-location";
export async function readDevicePosition(
  signal?: AbortSignal,
): Promise<ForegroundFix> {
  if (signal?.aborted) throw new Error("location_cancelled");
  if (Platform.OS !== "android")
    return LegacyLocation.getCurrentPositionAsync({
      accuracy: LegacyLocation.Accuracy.High,
    });
  const native = requireOptionalNativeModule<{
    getPosition: (id: string) => Promise<ForegroundFix>;
    cancel: (id: string) => Promise<void>;
  }>("AbasongLocation");
  if (!native) throw new Error("location_module_unavailable");
  const id = randomUUID();
  const cancel = () => {
    void native.cancel(id).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const fix = await native.getPosition(id);
    if (signal?.aborted) throw new Error("location_cancelled");
    if (
      Date.now() - fix.timestamp > 20_000 ||
      fix.timestamp > Date.now() + 1000
    )
      throw new Error("location_timeout");
    return fix;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "LOCATION_TIMEOUT"
    )
      throw new Error("location_timeout", { cause: error });
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
