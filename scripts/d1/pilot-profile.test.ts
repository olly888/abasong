import { afterEach, expect, it } from "vitest";
import config, {
  PILOT_API,
  PILOT_AUTH,
  validatePilotEnvironment,
} from "../../apps/mobile/app.config";
import base from "../../apps/mobile/app.json";
import { pilotBuildEnvironment } from "./prepare-pilot";
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
const env = () => ({
  EXPO_PUBLIC_API_BASE_URL: PILOT_API,
  EXPO_PUBLIC_SUPABASE_URL: PILOT_AUTH,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_TEST_ONLY",
  EXPO_PUBLIC_MAPBOX_TOKEN: "pk.TEST_ONLY",
});
const resolved = () =>
  config({
    config: base.expo as Parameters<typeof config>[0]["config"],
    projectRoot: "apps/mobile",
    staticConfigPath: null,
    packageJsonPath: "apps/mobile/package.json",
  });
it("pilot uses separate identities, public cloud configuration and no cleartext transport", () => {
  Object.assign(process.env, env(), { ABASONG_BUILD_PROFILE: "pilot-dev" });
  const c = resolved();
  expect(c.ios?.bundleIdentifier).toBe("com.abasong.pilot");
  expect(c.android?.package).toBe("com.abasong.pilot");
  expect(c.scheme).toBe("abasong-pilot");
  expect(c.updates?.enabled).toBe(false);
  expect(c.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: false,
  });
  expect(c.plugins).toContainEqual([
    "expo-notifications",
    expect.objectContaining({ enableRemoteNotifications: false }),
  ]);
  process.env.EXPO_PUBLIC_EXPO_PROJECT_ID =
    "11111111-1111-4111-8111-111111111111";
  expect(resolved().plugins).not.toContainEqual([
    "expo-notifications",
    expect.objectContaining({ enableRemoteNotifications: false }),
  ]);
});
it("normal and field-review identities remain independent", () => {
  delete process.env.ABASONG_BUILD_PROFILE;
  expect(resolved().ios?.bundleIdentifier).toBe("com.abasong.mobile");
  expect(resolved().ios?.infoPlist?.NSAppTransportSecurity).toEqual({
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
  });
  process.env.ABASONG_BUILD_PROFILE = "field-review";
  expect(resolved().ios?.bundleIdentifier).toBe("com.abasong.fieldreview");
  expect(resolved().ios?.infoPlist?.NSAppTransportSecurity).toEqual({
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: false,
  });
});
it("rejects LAN, other projects, secret keys, missing values and unknown profiles", () => {
  for (const override of [
    { EXPO_PUBLIC_API_BASE_URL: "http://192.168.1.180:3002" },
    { EXPO_PUBLIC_API_BASE_URL: PILOT_API + "/" },
    { EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_TEST_ONLY" },
    { EXPO_PUBLIC_MAPBOX_TOKEN: "sk.TEST_ONLY" },
    { EXPO_PUBLIC_MAPBOX_TOKEN: "" },
  ])
    expect(() => validatePilotEnvironment({ ...env(), ...override })).toThrow();
  process.env.ABASONG_BUILD_PROFILE = "other";
  expect(() => resolved()).toThrow();
});
it("build environment copies only selected public values and clears Metro/development overrides", () => {
  const result = pilotBuildEnvironment(
    {
      EXPO_PUBLIC_API_BASE_URL: "http://localhost:3001",
      EXPO_PUBLIC_OTHER: "TEST_PRIVATE",
      EXPO_PACKAGER_PROXY_URL: "http://localhost:8082",
      ENTRY_FILE: "src/field/entry.tsx",
      SKIP_BUNDLING: "1",
      PATH: "/bin",
    },
    env(),
  );
  expect(result.EXPO_PUBLIC_API_BASE_URL).toBe(PILOT_API);
  expect(result.ABASONG_BUILD_PROFILE).toBe("pilot-dev");
  expect(result.EXPO_NO_DOTENV).toBe("1");
  expect(result.PATH).toBe("/bin");
  for (const key of [
    "EXPO_PUBLIC_OTHER",
    "EXPO_PACKAGER_PROXY_URL",
    "ENTRY_FILE",
    "SKIP_BUNDLING",
  ])
    expect(result[key]).toBeUndefined();
});
