import { expect, it } from "vitest";
import {
  fixtureRequestAllowed,
  fixtureFaultMatch,
  childRunning,
} from "./native-exit-guard";
it("does not wait for a second exit after a child was terminated by a signal", () => {
  expect(childRunning({ exitCode: null, signalCode: null })).toBe(true);
  expect(childRunning({ exitCode: null, signalCode: "SIGTERM" })).toBe(false);
  expect(childRunning({ exitCode: 0, signalCode: null })).toBe(false);
});
it("keeps the disposable fixture unreachable from web origins or rebound hostnames", () => {
  const h = { host: "127.0.0.1:3028", "content-type": "application/json" };
  expect(fixtureRequestAllowed(h, "/fixture/control", "POST")).toBe(true);
  for (const bad of [
    { host: "example.com:3028" },
    { origin: "https://example.com" },
    { referer: "http://localhost" },
    { "sec-fetch-site": "cross-site" },
  ])
    expect(fixtureRequestAllowed({ ...h, ...bad }, "/fixture", "GET")).toBe(
      false,
    );
  for (const path of [
    "https://example.com/v1/me",
    "//example.com/v1/me",
    "/fixture/other",
    "/v1/../fixture",
    "/v1/%2e%2e/fixture",
    "/v1/auth/login",
    "/v1/me/capabilities",
  ])
    expect(fixtureRequestAllowed(h, path, "GET")).toBe(false);
  expect(
    fixtureRequestAllowed(
      { host: "localhost:3028" },
      "/fixture/control",
      "POST",
    ),
  ).toBe(false);
});
it("injects a one-shot fault only into the intended versioned mutation", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(fixtureFaultMatch("create", "POST", "/v1/requests")).toBe(true);
  expect(
    fixtureFaultMatch("apply", "POST", `/v1/requests/${id}/applications`),
  ).toBe(true);
  expect(
    fixtureFaultMatch("apply", "GET", `/v1/requests/${id}/applications`),
  ).toBe(false);
  expect(fixtureFaultMatch("apply", "POST", "/fixture/control")).toBe(false);
  expect(fixtureFaultMatch("other", "POST", "/v1/requests")).toBe(false);
});

it("separates contribution paths from delivery paths in the disposable broker", () => {
  const h = { host: "127.0.0.1:3028", "content-type": "application/json" };
  const path = "/v1/me/import-batches";
  expect(fixtureRequestAllowed(h, path, "POST")).toBe(false);
  expect(fixtureRequestAllowed(h, path, "POST", "contribution")).toBe(true);
  expect(fixtureRequestAllowed(h, "/v1/requests", "POST", "contribution")).toBe(
    false,
  );
  expect(
    fixtureRequestAllowed(h, "/v1/me/capabilities", "GET", "contribution"),
  ).toBe(false);
});
