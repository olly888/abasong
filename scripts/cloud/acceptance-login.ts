// Internal, loopback-only operator aid. Not shipped in the app or cloud image.
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import {
  PILOT_AUTH,
  PILOT_API,
  validatePilotEnvironment,
} from "../../apps/mobile/app.config";
import { readAcceptanceSession } from "./pilot-admission";

const origin = "http://127.0.0.1:8785";
export function allowedLocalRequest(
  method: string,
  path: string,
  host: string | undefined,
  requestOrigin: string | undefined,
  csrf: string | undefined,
  expected: string,
) {
  if (host !== "127.0.0.1:8785") return false;
  return method === "GET"
    ? path === "/" || path === "/state"
    : method === "POST" &&
        ["/send", "/verify"].includes(path) &&
        requestOrigin === origin &&
        csrf === expected;
}
export function phoneInput(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 30)
    throw new Error("Invalid phone");
  const v = raw.replace(/[ ()-]/g, "");
  const value = /^\d{10}$/.test(v) ? `+1${v}` : v;
  if (!/^\+1\d{10}$/.test(value)) throw new Error("US phone required");
  return value;
}
export function privateSession(value: unknown, now = Date.now()) {
  const s = value as {
    access_token?: unknown;
    expires_in?: unknown;
    user?: { id?: unknown };
    token_type?: unknown;
  };
  if (
    typeof s.access_token !== "string" ||
    s.access_token.length > 16384 ||
    s.access_token.split(".").length !== 3 ||
    s.token_type !== "bearer" ||
    typeof s.user?.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(s.user.id) ||
    typeof s.expires_in !== "number" ||
    s.expires_in < 60 ||
    s.expires_in > 7200
  )
    throw new Error("Invalid session");
  return {
    access_token: s.access_token,
    user_id: s.user.id,
    expires_at: new Date(
      now + Math.min(s.expires_in, 3600) * 1000,
    ).toISOString(),
    authenticated_at: new Date(now).toISOString(),
    api: PILOT_API,
    issuer: PILOT_AUTH + "/auth/v1",
  };
}
async function jsonBody(req: IncomingMessage) {
  if (req.headers["content-type"] !== "application/json")
    throw new Error("JSON required");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2048) throw new Error("Body limit");
    chunks.push(chunk);
  }
  const b = JSON.parse(Buffer.concat(chunks).toString());
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new Error("Invalid body");
  return b as Record<string, unknown>;
}
async function upstream(
  url: string,
  key: string,
  body?: unknown,
  token?: string,
) {
  if (
    !url.startsWith(PILOT_AUTH + "/auth/v1/") &&
    url !== PILOT_API + "/v1/me/bootstrap"
  )
    throw new Error("Destination refused");
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: key,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body
        ? {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 131072 || !response.ok)
    throw new Error(`Upstream ${response.status}`);
  return JSON.parse(Buffer.from(bytes).toString());
}
function signedInUser(role: "A" | "B") {
  try {
    return readAcceptanceSession(role).user_id;
  } catch {
    return null;
  }
}
function main() {
  if (process.argv.slice(2).join() !== "--start")
    throw new Error("Explicit local login start required");
  const publicValues = parseEnv(readFileSync("apps/mobile/.env.local", "utf8"));
  validatePilotEnvironment({
    ...publicValues,
    EXPO_PUBLIC_API_BASE_URL: PILOT_API,
  });
  const key = publicValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    csrf = randomBytes(32).toString("hex"),
    nonce = randomBytes(24).toString("hex");
  const out = resolve(".tooling/cloud-runtime/acceptance");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  chmodSync(out, 0o700);
  const states: Record<
    "A" | "B",
    { phone?: string; sent?: number; sends: number }
  > = { A: { sends: 0 }, B: { sends: 0 } };
  const expires = Date.now() + 3600000;
  let busy = false;
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      );
      const reply = (status: number, b: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(b));
      };
      try {
        if (
          Date.now() > expires ||
          !allowedLocalRequest(
            req.method ?? "",
            req.url ?? "",
            req.headers.host,
            req.headers.origin,
            req.headers["x-abasong-csrf"] as string | undefined,
            csrf,
          )
        ) {
          reply(403, { error: "操作已失效或来源不符" });
          return;
        }
        if (req.method === "GET") {
          if (req.url === "/state") {
            reply(200, {
              A: Boolean(signedInUser("A")),
              B: Boolean(signedInUser("B")),
            });
            return;
          }
          const html = readFileSync(
            "scripts/cloud/acceptance-login.html",
            "utf8",
          )
            .replaceAll("{{NONCE}}", nonce)
            .replace("{{CSRF}}", csrf);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
        if (busy) {
          reply(409, { error: "请等待本次操作完成" });
          return;
        }
        busy = true;
        try {
          const body = await jsonBody(req),
            role = body.account;
          if (role !== "A" && role !== "B") throw new Error("Account required");
          const state = states[role];
          if (signedInUser(role)) throw new Error("Already signed");
          if (req.url === "/send") {
            if (
              Object.keys(body).sort().join() !== "account,phone" ||
              state.sends >= 3 ||
              (state.sent && Date.now() - state.sent < 60000)
            )
              throw new Error("Send limited");
            const phone = phoneInput(body.phone);
            state.sends++;
            state.sent = Date.now();
            await upstream(PILOT_AUTH + "/auth/v1/otp", key, {
              phone,
              create_user: true,
              channel: "sms",
            });
            state.phone = phone;
            reply(200, { ok: true });
          } else {
            if (
              Object.keys(body).sort().join() !== "account,code" ||
              !state.phone ||
              typeof body.code !== "string" ||
              !/^\d{6,8}$/.test(body.code)
            )
              throw new Error("Verification required");
            const verified = privateSession(
              await upstream(PILOT_AUTH + "/auth/v1/verify", key, {
                phone: state.phone,
                token: body.code,
                type: "sms",
              }),
            );
            if (signedInUser(role === "A" ? "B" : "A") === verified.user_id)
              throw new Error("Two different accounts required");
            const me = await upstream(
              PILOT_API + "/v1/me/bootstrap",
              key,
              { display_name: "Pilot " + role },
              verified.access_token,
            );
            if (
              me.user_id !== verified.user_id ||
              me.status !== "active" ||
              !me.profile
            )
              throw new Error("Business identity mismatch");
            const staged = resolve(out, `account-${role}.${randomUUID()}.tmp`);
            writeFileSync(staged, JSON.stringify(verified), {
              mode: 0o600,
              flag: "wx",
            });
            try {
              renameSync(staged, resolve(out, `account-${role}.json`));
            } finally {
              rmSync(staged, { force: true });
            }
            state.sends = 0;
            delete state.phone;
            reply(200, { ok: true });
          }
        } finally {
          busy = false;
        }
      } catch {
        reply(400, {
          error:
            "操作未完成。请检查号码、验证码或服务状态后重试；不要连续发送。",
        });
      }
    },
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  server.listen(8785, "127.0.0.1", () =>
    console.log(
      "本机双账号登录验收页：http://127.0.0.1:8785 （仅一小时，不输出号码或验证码）",
    ),
  );
  const timer = setTimeout(() => server.close(), 3600000);
  timer.unref();
}
if (process.argv[1]?.endsWith("acceptance-login.ts")) {
  try {
    main();
  } catch {
    console.error("Local pilot login stopped; private details omitted.");
    process.exitCode = 1;
  }
}
