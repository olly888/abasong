import { Platform } from "react-native";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import { sessionStorage } from "../auth/secure-storage";
import { dataRequest, apiBase } from "../apartments/client";
import { boundedTokenLookup } from "./bounded";
type S = components["schemas"];
type Proof = S["InstallationProof"];
type Binding = Proof & { owner: string };
const installationKey = "abasong.push.installation.v1",
  bindingKey = "abasong.push.binding.v1",
  queueKey = "abasong.push.revocations.v1";
let owner: string | null = null,
  generation = 0,
  serial: Promise<unknown> = Promise.resolve();
export function setPushOwner(next: string | null) {
  if (owner !== next) {
    owner = next;
    generation++;
  }
}
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = serial.catch(() => {}).then(fn);
  serial = next;
  return next;
}
export async function notificationSdk() {
  return import("expo-notifications");
}
export function pushProjectId() {
  const id =
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId;
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
}
export async function drainPushRevocations() {
  const list: Proof[] = JSON.parse(
    (await sessionStorage.getItem(queueKey)) ?? "[]",
  );
  // One bounded network attempt per lifecycle tick. Logout must not wait for
  // ten offline requests; the rest remain in secure storage for later retry.
  const remaining: Proof[] = list.slice(1);
  for (const p of list.slice(0, 1)) {
    try {
      if (!__DEV__ && !apiBase.startsWith("https://")) throw new Error();
      const r = await fetch(apiBase + "/v1/device-installations/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error();
    } catch {
      remaining.unshift(p);
    }
  }
  await sessionStorage.setItem(queueKey, JSON.stringify(remaining));
}
export async function pushPermission() {
  if (Platform.OS === "web") return "unavailable" as const;
  try {
    const n = await notificationSdk(),
      p = await n.getPermissionsAsync();
    return p.granted
      ? ("granted" as const)
      : p.canAskAgain
        ? ("undetermined" as const)
        : ("denied" as const);
  } catch {
    return "unavailable" as const;
  }
}
export function registerPush(session: Session, ask = false) {
  return serialized(async () => {
    const g = generation;
    if (owner !== session.user.id) return false;
    await drainPushRevocations();
    const projectId = pushProjectId();
    if (!projectId || Platform.OS === "web") return false;
    const n = await notificationSdk();
    if (Platform.OS === "android")
      await n.setNotificationChannelAsync("collaboration", {
        name: "配送协作",
        importance: n.AndroidImportance.DEFAULT,
      });
    let p = await n.getPermissionsAsync();
    if (!p.granted && ask && p.canAskAgain)
      p = await n.requestPermissionsAsync();
    if (!p.granted) {
      await revokeStoredBinding();
      return false;
    }
    const token = (
      await boundedTokenLookup(() => n.getExpoPushTokenAsync({ projectId }))
    ).data;
    let installation = JSON.parse(
      (await sessionStorage.getItem(installationKey)) ?? "null",
    ) as Pick<Proof, "installation_id" | "installation_secret"> | null;
    if (!installation) {
      installation = {
        installation_id: randomUUID(),
        installation_secret: (randomUUID() + randomUUID()).replaceAll("-", ""),
      };
      await sessionStorage.setItem(
        installationKey,
        JSON.stringify(installation),
      );
    }
    if (g !== generation || owner !== session.user.id) return false;
    const d = await dataRequest<S["Device"]>(session, "/v1/me/devices", {
      method: "POST",
      key: randomUUID(),
      body: {
        ...installation,
        platform: Platform.OS,
        enabled: true,
        push_token: token,
      },
    });
    const binding: Binding = {
      ...installation,
      binding_version: d.binding_version,
      owner: session.user.id,
    };
    if (g !== generation || owner !== session.user.id) {
      await queueRevoke(binding);
      await drainPushRevocations();
      return false;
    }
    await sessionStorage.setItem(bindingKey, JSON.stringify(binding));
    return true;
  });
}
async function queueRevoke(binding: Binding) {
  const list: Proof[] = JSON.parse(
    (await sessionStorage.getItem(queueKey)) ?? "[]",
  );
  const proof: Proof = {
    installation_id: binding.installation_id,
    installation_secret: binding.installation_secret,
    binding_version: binding.binding_version,
  };
  if (
    !list.some(
      (p) =>
        p.installation_id === proof.installation_id &&
        p.binding_version === proof.binding_version,
    )
  )
    list.push(proof);
  await sessionStorage.setItem(queueKey, JSON.stringify(list.slice(-10)));
}
async function revokeStoredBinding() {
  const value = await sessionStorage.getItem(bindingKey);
  if (!value) return;
  await queueRevoke(JSON.parse(value));
  await sessionStorage.removeItem(bindingKey);
  await drainPushRevocations();
}
export async function preparePushLogout() {
  setPushOwner(null);
  // Preserve only narrow installation revocations for offline retry, no account JWT.
  await serialized(async () => {
    const bound = await sessionStorage.getItem(bindingKey);
    if (!bound) return;
    await queueRevoke(JSON.parse(bound));
    await sessionStorage.removeItem(bindingKey);
    try {
      const n = await notificationSdk();
      await Promise.allSettled([
        n.unregisterForNotificationsAsync(),
        n.dismissAllNotificationsAsync(),
        n.cancelAllScheduledNotificationsAsync(),
        n.clearLastNotificationResponseAsync(),
      ]);
    } catch {
      // Native permission/token cleanup can be unavailable in an old preview;
      // the versioned server revocation remains queued for the next connection.
    }
    await drainPushRevocations();
  });
}
