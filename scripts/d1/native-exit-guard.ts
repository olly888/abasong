import type { IncomingHttpHeaders } from "node:http";
import type { ChildProcess } from "node:child_process";
export const childRunning = (
  child: Pick<ChildProcess, "exitCode" | "signalCode">,
) => child.exitCode === null && child.signalCode === null;
export function fixtureRequestAllowed(
  h: IncomingHttpHeaders,
  path: string,
  method: string,
  scenario: "delivery" | "contribution" = "delivery",
) {
  if (h.origin || h.referer || h["sec-fetch-site"]) return false;
  if (
    !["127.0.0.1:3028", "localhost:3028", "10.0.2.2:3028"].includes(
      h.host ?? "",
    )
  )
    return false;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  if (
    method !== "GET" &&
    !String(h["content-type"]).startsWith("application/json")
  )
    return false;
  const [pathname] = path.split("?");
  const deliveryPath =
    /^\/v1\/(requests|regions|drivers|conversations|applications)(\/[a-z0-9-]+)*$/i.test(
      pathname ?? "",
    ) ||
    /^\/v1\/me\/(requests|applications|availability|profile|organization(?:\/summary)?)$/.test(
      pathname ?? "",
    );
  const contributionPath =
    /^\/v1\/(apartments|access-records)(\/[a-z0-9-]+)*$/i.test(
      pathname ?? "",
    ) ||
    /^\/v1\/me\/(contributions|apartment-library|private-access-records|import-policy|import-batches)(\/[a-z0-9-]+)*$/i.test(
      pathname ?? "",
    );
  const businessPath =
    scenario === "contribution" ? contributionPath : deliveryPath;
  return (
    (businessPath && /^\/v1\/[a-z0-9/?%_=,&.-]+$/i.test(path)) ||
    [
      "/fixture",
      "/fixture/snapshot",
      "/fixture/control",
      "/fixture/profile-checks",
    ].includes(path)
  );
}
export function fixtureFaultMatch(
  operation: string,
  method: string,
  path: string,
) {
  if (operation === "read")
    return (
      method === "PUT" &&
      /^\/v1\/conversations\/[a-f0-9-]{36}\/read$/.test(path)
    );
  if (operation === "conversation")
    return (
      method === "GET" && /^\/v1\/conversations\/[a-f0-9-]{36}$/.test(path)
    );
  if (operation === "team")
    return method === "PUT" && path === "/v1/me/organization";
  if (operation === "profile")
    return method === "PATCH" && path === "/v1/me/profile";
  if (operation === "availability")
    return method === "PUT" && path === "/v1/me/availability";
  if (method !== "POST") return false;
  if (operation === "contribute")
    return /^\/v1\/apartments\/[a-f0-9-]{36}\/access-records$/.test(path);
  if (operation === "correct")
    return /^\/v1\/me\/contributions\/[a-f0-9-]{36}\/corrections$/.test(path);
  if (operation === "import_commit")
    return /^\/v1\/me\/import-batches\/[a-f0-9-]{36}\/commit$/.test(path);
  return operation === "create"
    ? path === "/v1/requests"
    : operation === "publish"
      ? /^\/v1\/requests\/[a-f0-9-]{36}\/publish$/.test(path)
      : operation === "apply"
        ? /^\/v1\/requests\/[a-f0-9-]{36}\/applications$/.test(path)
        : operation === "message" &&
          /^\/v1\/conversations\/[a-f0-9-]{36}\/messages$/.test(path);
}
