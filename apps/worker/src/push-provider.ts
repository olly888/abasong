export type PushData = {
  version: 1;
  owner_id: string;
  kind: "conversation" | "request" | "post";
  object_id: string;
};
export type PushPayload = { title: string; body: string; data: PushData };
export interface PushProvider {
  send(token: string, payload: PushPayload): Promise<string>;
  receipt(ticket: string): Promise<"ok" | "pending">;
}
export class PushFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super("Push provider unavailable");
  }
}
function failure(value: unknown): never {
  const code =
    typeof value === "string" &&
    [
      "DeviceNotRegistered",
      "MessageTooBig",
      "MessageRateExceeded",
      "MismatchSenderId",
      "InvalidCredentials",
    ].includes(value)
      ? value
      : "ProviderError";
  throw new PushFailure(
    code,
    ["MessageRateExceeded", "ProviderError"].includes(code),
  );
}
export class ExpoPushProvider implements PushProvider {
  constructor(
    private readonly accessToken?: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async post(path: "send" | "getReceipts", body: unknown) {
    let r: Response;
    try {
      r = await this.transport(`https://exp.host/--/api/v2/push/${path}`, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(this.accessToken
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new PushFailure("NetworkError", true);
    }
    if (!r.ok)
      throw new PushFailure(
        r.status === 429
          ? "RateLimited"
          : r.status === 401
            ? "InvalidCredentials"
            : "ProviderHttpError",
        r.status === 429 || r.status >= 500,
      );
    try {
      const text = await r.text();
      if (text.length > 16384) throw new Error();
      return JSON.parse(text) as { data?: unknown; errors?: unknown };
    } catch {
      throw new PushFailure("InvalidResponse", true);
    }
  }
  async send(token: string, payload: PushPayload) {
    if (!/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,200}\]$/.test(token))
      throw new PushFailure("InvalidToken", false);
    const response = await this.post("send", {
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      ttl: 300,
      sound: "default",
      channelId: "collaboration",
    });
    const data = response.data as
      | { status?: string; id?: string; details?: { error?: string } }
      | undefined;
    if (
      data?.status === "ok" &&
      typeof data.id === "string" &&
      data.id.length <= 200
    )
      return data.id;
    failure(data?.details?.error);
  }
  async receipt(ticket: string) {
    const response = await this.post("getReceipts", { ids: [ticket] });
    const data = (
      response.data as
        | Record<string, { status?: string; details?: { error?: string } }>
        | undefined
    )?.[ticket];
    if (!data) return "pending";
    if (data.status === "ok") return "ok";
    failure(data.details?.error);
  }
}
