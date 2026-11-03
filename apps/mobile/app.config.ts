import type { ConfigContext, ExpoConfig } from "expo/config";
export const PILOT_API = "https://api-dev.abasong.com";
export const PILOT_AUTH = "https://mxlmemaunzoramgemiju.supabase.co";

// Public values only. A pilot binary must never silently fall back to a LAN API
// or the retired identity project, even when built from a developer's shell.
export function validatePilotEnvironment(env: NodeJS.ProcessEnv) {
  if (
    env.EXPO_PUBLIC_API_BASE_URL !== PILOT_API ||
    env.EXPO_PUBLIC_SUPABASE_URL !== PILOT_AUTH ||
    !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
    !env.EXPO_PUBLIC_MAPBOX_TOKEN?.startsWith("pk.")
  )
    throw new Error(
      "Pilot requires its fixed HTTPS API, DevWest and public keys",
    );
}
// A separate signed field-review app. Normal app and development previews keep
// their original identifiers, scheme, entry point and permissions.
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const profile = process.env.ABASONG_BUILD_PROFILE;
  if (!profile) return base;
  if (profile === "pilot-dev") {
    validatePilotEnvironment(process.env);
    return {
      ...base,
      scheme: "abasong-pilot",
      updates: { ...base.updates, enabled: false },
      ios: {
        ...base.ios,
        bundleIdentifier: "com.abasong.pilot",
        infoPlist: {
          ...base.ios?.infoPlist,
          CFBundleDisplayName: "Abasong内测",
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: false,
            NSAllowsLocalNetworking: false,
          },
        },
      },
      android: {
        ...base.android,
        package: "com.abasong.pilot",
      },
      extra: { ...base.extra, buildEnvironment: "pilot-dev" },
    };
  }
  if (profile !== "field-review")
    throw new Error("Unknown Abasong build profile");
  return {
    ...base,
    scheme: "abasong-field",
    ios: {
      ...base.ios,
      bundleIdentifier: "com.abasong.fieldreview",
      infoPlist: {
        ...base.ios?.infoPlist,
        CFBundleDisplayName: "Abasong入口核对",
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: false,
        },
        NSLocationWhenInUseUsageDescription:
          "显示你与Woodside公开候选入口的位置，核对配送入口。",
      },
    },
    extra: { ...base.extra, fieldReviewVersion: "woodside-review-v1" },
  };
};
