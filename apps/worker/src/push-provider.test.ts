import { expect, it } from "vitest";
import { ExpoPushProvider, PushFailure } from "./push-provider";
const payload = {
  title: "Abasong",
  body: "你有一条新消息",
  data: {
    version: 1 as const,
    owner_id: "TEST-owner",
    kind: "conversation" as const,
    object_id: "TEST-conversation",
  },
};
it("separates vendor tickets, absent receipts and provider acceptance", async () => {
  const replies = [
    { data: { status: "ok", id: "TEST-ticket" } },
    { data: {} },
    { data: { "TEST-ticket": { status: "ok" } } },
  ];
  const transport: typeof fetch = async (url, options) => {
    expect(String(url)).toMatch(
      /^https:\/\/exp.host\/--\/api\/v2\/push\/(send|getReceipts)$/,
    );
    expect(options?.redirect).toBe("error");
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  };
  const provider = new ExpoPushProvider(undefined, transport);
  expect(await provider.send("ExpoPushToken[TEST_VALID_TOKEN]", payload)).toBe(
    "TEST-ticket",
  );
  expect(await provider.receipt("TEST-ticket")).toBe("pending");
  expect(await provider.receipt("TEST-ticket")).toBe("ok");
});
it("classifies retryable transport failures and permanently unregistered devices without leaking raw vendor content", async () => {
  const network = new ExpoPushProvider(undefined, async () => {
    throw new Error("TEST secret upstream");
  });
  await expect(
    network.send("ExpoPushToken[TEST_VALID_TOKEN]", payload),
  ).rejects.toMatchObject({ code: "NetworkError", retryable: true });
  const limited = new ExpoPushProvider(
    undefined,
    async () => new Response("TEST sensitive", { status: 429 }),
  );
  await expect(
    limited.send("ExpoPushToken[TEST_VALID_TOKEN]", payload),
  ).rejects.toMatchObject({ code: "RateLimited", retryable: true });
  const dead = new ExpoPushProvider(
    undefined,
    async () =>
      new Response(
        JSON.stringify({
          data: {
            status: "error",
            details: { error: "DeviceNotRegistered" },
            message: "TEST private",
          },
        }),
      ),
  );
  try {
    await dead.send("ExpoPushToken[TEST_VALID_TOKEN]", payload);
  } catch (e) {
    expect(e).toBeInstanceOf(PushFailure);
    expect(e).toMatchObject({ code: "DeviceNotRegistered", retryable: false });
    expect((e as Error).message).not.toContain("private");
  }
});
