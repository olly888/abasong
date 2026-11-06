import type { IncomingHttpHeaders } from "node:http";
import type { ChildProcess } from "node:child_process";
export const childRunning = (
  child: Pick<ChildProcess, "exitCode" | "signalCode">,
) => child.exitCode === null && child.signalCode === null;
export function fixtureRequestAllowed(
  h: IncomingHttpHeaders,
  path: string,
  method: string,
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
  const businessPath =
    /^\/v1\/(requests|regions|drivers|conversations|applications)(\/[a-z0-9-]+)*$/i.test(
      pathname ?? "",
    ) ||
    /^\/v1\/me\/(requests|applications|availability)$/.test(pathname ?? "");
  return (
    (businessPath && /^\/v1\/[a-z0-9/?%_=,&.-]+$/i.test(path)) ||
    ["/fixture", "/fixture/snapshot", "/fixture/control"].includes(path)
  );
}
export function fixtureFaultMatch(
  operation: string,
  method: string,
  path: string,
) {
  if (method !== "POST") return false;
  return operation === "create"
    ? path === "/v1/requests"
    : operation === "publish"
      ? /^\/v1\/requests\/[a-f0-9-]{36}\/publish$/.test(path)
      : operation === "apply"
        ? /^\/v1\/requests\/[a-f0-9-]{36}\/applications$/.test(path)
        : operation === "message" &&
          /^\/v1\/conversations\/[a-f0-9-]{36}\/messages$/.test(path);
}
