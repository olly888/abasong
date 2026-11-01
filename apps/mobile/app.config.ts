import type { ConfigContext, ExpoConfig } from "expo/config";
// A separate signed field-review app. Normal app and development previews keep
// their original identifiers, scheme, entry point and permissions.
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const profile = process.env.ABASONG_BUILD_PROFILE;
  if (!profile) return base;
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
