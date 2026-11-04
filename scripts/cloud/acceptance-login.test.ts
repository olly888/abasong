import { expect, it } from "vitest";
import {
  allowedLocalRequest,
  phoneInput,
  privateSession,
} from "./acceptance-login";
import { assertBootstrapConfigUpdate } from "./update-business-config";
import { buildRuntimeTemplates } from "./runtime-templates";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

it("loads the actual login page script without a syntax error that would disable both SMS buttons", () => {
  const html = readFileSync("scripts/cloud/acceptance-login.html", "utf8");
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  expect(script).toBeTruthy();
  expect(() => new Script(script!)).not.toThrow();
});

it("refuses foreign Host/Origin/CSRF, queries, methods and unknown endpoints", () => {
  expect(
    allowedLocalRequest(
      "POST",
      "/verify",
      "127.0.0.1:8785",
      "http://127.0.0.1:8785",
      "test-csrf",
      "test-csrf",
    ),
  ).toBe(true);
  for (const input of [
    ["POST", "/verify", "evil.example", "http://127.0.0.1:8785", "test-csrf"],
    ["POST", "/verify", "127.0.0.1:8785", "https://evil.example", "test-csrf"],
    ["POST", "/verify", "127.0.0.1:8785", "http://127.0.0.1:8785", "wrong"],
    ["POST", "/admin", "127.0.0.1:8785", "http://127.0.0.1:8785", "test-csrf"],
    ["GET", "/?token=ignored", "127.0.0.1:8785", undefined, undefined],
  ])
    expect(
      allowedLocalRequest(
        input[0]!,
        input[1]!,
        input[2],
        input[3],
        input[4],
        "test-csrf",
      ),
    ).toBe(false);
});
it("normalizes US phone input without accepting destinations or arbitrary bodies", () => {
  expect(phoneInput("(202) 555-0123")).toBe("+12025550123");
  for (const bad of [null, {}, "+442025550123", "2025550123\n"])
    expect(() => phoneInput(bad)).toThrow();
});
it("stores access tokens only, limits test lifetime and binds the reviewed API/issuer", () => {
  const s = privateSession(
    {
      access_token: "test.payload.signature",
      refresh_token: "TEST-private-refresh",
      expires_in: 7200,
      token_type: "bearer",
      user: { id: "11111111-1111-4111-8111-111111111111" },
    },
    0,
  );
  expect(s.expires_at).toBe("1970-01-01T01:00:00.000Z");
  expect(JSON.stringify(s)).not.toContain("TEST-private-refresh");
  expect(() => privateSession({ access_token: "bad" })).toThrow();
});
it("accepts only the single missing secret binding against the exact running template", () => {
  const next = buildRuntimeTemplates().runtime,
    prior = structuredClone(next);
  const task = (prior.Resources.ApiTask as { Properties: unknown })
    .Properties as {
    ContainerDefinitions: Array<{ Secrets: Array<{ Name: string }> }>;
  };
  task.ContainerDefinitions[0]!.Secrets =
    task.ContainerDefinitions[0]!.Secrets.filter(
      (s) => s.Name !== "IDEMPOTENCY_HMAC_KEY",
    );
  expect(() => assertBootstrapConfigUpdate(prior, next)).not.toThrow();
  expect(() => assertBootstrapConfigUpdate(next, next)).toThrow();
  const drift = structuredClone(prior);
  (
    drift.Resources.ApiService as { Properties: { DesiredCount: number } }
  ).Properties.DesiredCount = 2;
  expect(() => assertBootstrapConfigUpdate(drift, next)).toThrow();
});
