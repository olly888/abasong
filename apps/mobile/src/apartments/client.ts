import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../auth/supabase";
import { AccountError } from "../auth/api-client";
const base =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:3001"
    : "http://127.0.0.1:3001");
export async function dataRequest<T>(
  session: Session,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!__DEV__ && !base.startsWith("https://"))
    throw new AccountError(503, "API_NOT_CONFIGURED", "资料服务暂不可用");
  async function perform(token: string): Promise<T> {
    const controller = new AbortController(),
      abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, 10000);
    try {
      const response = await fetch(base + path, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.key ? { "Idempotency-Key": options.key } : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok)
        throw new AccountError(
          response.status,
          value.code ?? "UNAVAILABLE",
          typeof value.message === "string" ? value.message : "资料暂不可用",
        );
      return value as T;
    } catch (e) {
      if (e instanceof AccountError) throw e;
      throw new AccountError(
        503,
        "NETWORK_UNAVAILABLE",
        "暂时无法连接，请重试",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  try {
    return await perform(session.access_token);
  } catch (e) {
    if (!(e instanceof AccountError) || e.status !== 401 || !supabase) throw e;
    const result = await supabase.auth.refreshSession();
    const next = result.data.session;
    if (
      result.error ||
      !next ||
      next.user.id !== session.user.id ||
      options.signal?.aborted
    )
      throw new AccountError(401, "AUTH_REQUIRED", "请重新登录");
    return perform(next.access_token);
  }
}
