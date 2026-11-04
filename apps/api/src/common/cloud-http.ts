import { createHmac, randomBytes } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { ApiRequest } from "./request-context";

type Counter = { start: number; count: number };
type SafeRequestLog = {
  event: "http";
  route: string;
  method: string;
  status: number;
  duration_ms: number;
  request_id: string;
};
function group(path: string) {
  if (/^\/health\/(live|ready)$/.test(path)) return "health";
  for (const name of ["search", "nearby", "apartments", "me"])
    if (path === `/v1/${name}` || path.startsWith(`/v1/${name}/`)) return name;
  return "other";
}

/** Single-process pilot protection. No external IP, path or payload is logged.
 * Horizontal scaling requires shared search sessions and distributed limiting.
 */
export function cloudHttpProtection(
  log: (record: SafeRequestLog) => void = (record) =>
    console.log(JSON.stringify(record)),
  now: () => number = Date.now,
) {
  const clients = new Map<string, Counter>();
  const key = randomBytes(32); // Process-local identifier, not the business HMAC.
  let global: Counter = { start: now(), count: 0 };
  let health: Counter = { start: now(), count: 0 };
  let lastCleanup = now();
  return (req: ApiRequest, res: Response, next: NextFunction) => {
    const started = now();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Strict-Transport-Security", "max-age=86400");
    const route = group(req.path);
    res.once("finish", () => {
      // Health polling creates no request log. Values are bounded/allowlisted,
      // including method and UUID generated before this middleware.
      if (route !== "health")
        log({
          event: "http",
          route,
          method: [
            "GET",
            "POST",
            "PATCH",
            "PUT",
            "DELETE",
            "OPTIONS",
            "HEAD",
          ].includes(req.method)
            ? req.method
            : "other",
          status: res.statusCode,
          duration_ms: Math.max(0, now() - started),
          request_id: req.requestId ?? "unassigned",
        });
    });
    if (started - lastCleanup >= 60000) {
      for (const [id, counter] of clients)
        if (started - counter.start >= 60000) clients.delete(id);
      lastCleanup = started;
    }
    // trust proxy=1 is safe only with the matching ALB-only security group and
    // ALB append-XFF configuration. Never accept a caller's leftmost XFF value.
    const id = createHmac("sha256", key)
      .update(req.ip ?? "unknown")
      .digest("hex");
    let client = clients.get(id);
    if (!client || started - client.start >= 60000) {
      client = { start: started, count: 0 };
      if (clients.size < 5000 || clients.has(id)) clients.set(id, client);
      else client.count = 240;
    }
    if (started - global.start >= 1000) global = { start: started, count: 0 };
    if (started - health.start >= 1000) health = { start: started, count: 0 };
    // Reserve a small separate health budget so client traffic cannot mark the
    // process unhealthy by exhausting the public request counter.
    const globalAllowed =
      route === "health" ? ++health.count <= 10 : ++global.count <= 50;
    if (++client.count > 240 || !globalAllowed) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "请求过于频繁",
        request_id: req.requestId,
      });
      return;
    }
    next();
  };
}
