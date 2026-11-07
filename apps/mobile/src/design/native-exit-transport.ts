import type {
  BusinessRequestOptions,
  ProfileRequest,
} from "../profile/profile-session";
import { AccountError } from "../auth/api-client";
export type ExitActor = "owner" | "driver";
export type ExitFixture = {
  owner: string;
  driver: string;
  region: string;
  pickup: string;
  isolated: boolean;
};
export function nativeExitTransport(
  base: string,
  actor: ExitActor,
): ProfileRequest {
  if (!["http://127.0.0.1:3028", "http://10.0.2.2:3028"].includes(base))
    throw new Error("TEST 仅允许本机临时服务");
  return async <T>(path: string, options?: BusinessRequestOptions) => {
    if (
      !(
        path.startsWith("/v1/") ||
        ["/fixture", "/fixture/snapshot", "/fixture/control"].includes(path)
      ) ||
      path.includes("..")
    )
      throw new Error("TEST 路径无效");
    const c = new AbortController(),
      abort = () => c.abort();
    options?.signal?.addEventListener("abort", abort, { once: true });
    if (options?.signal?.aborted) c.abort();
    const timer = setTimeout(abort, 15000);
    try {
      const transport =
        options?.raw || options?.acceptJpeg
          ? (await import("expo/fetch")).fetch
          : fetch;
      const r = await transport(base + path, {
        method: options?.method ?? "GET",
        headers: {
          "Content-Type": options?.raw
            ? "application/octet-stream"
            : "application/json",
          "X-Abasong-Test-Actor": actor,
          ...(options?.key ? { "Idempotency-Key": options.key } : {}),
        },
        body:
          options?.raw ??
          (options?.body === undefined
            ? undefined
            : JSON.stringify(options.body)),
        signal: c.signal,
      });
      if (
        r.ok &&
        options?.acceptJpeg &&
        r.headers.get("Content-Type") === "image/jpeg"
      )
        return (await r.arrayBuffer()) as T;
      const value = await r.json();
      if (!r.ok)
        throw new AccountError(
          r.status,
          value.code ?? "UNAVAILABLE",
          value.message ?? "TEST · 请求失败",
        );
      return value as T;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", abort);
    }
  };
}
