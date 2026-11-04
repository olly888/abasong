import { EventEmitter } from "node:events";
import type { Response } from "express";
import { expect, it, vi } from "vitest";
import { cloudHttpProtection } from "./cloud-http";
import type { ApiRequest } from "./request-context";

function request(ip = "192.0.2.1", path = "/v1/apartments/TEST?latitude=TEST") {
  return {
    ip,
    path: path.split("?")[0],
    originalUrl: path,
    method: "GET",
    headers: { authorization: "TEST-SECRET" },
    body: { code: "TEST-PASSWORD" },
    requestId: "11111111-1111-4111-8111-111111111111",
  } as unknown as ApiRequest;
}
function response() {
  const r = new EventEmitter() as EventEmitter & {
    statusCode: number;
    setHeader: ReturnType<typeof vi.fn>;
    status: (s: number) => typeof r;
    json: ReturnType<typeof vi.fn>;
  };
  r.statusCode = 200;
  r.setHeader = vi.fn();
  r.status = (s) => {
    r.statusCode = s;
    return r;
  };
  r.json = vi.fn();
  return r;
}
it("logs only allowlisted route groups, never an address, query, IP, JWT or body", () => {
  const sink = vi.fn(),
    next = vi.fn(),
    r = response();
  cloudHttpProtection(sink)(request(), r as unknown as Response, next);
  r.emit("finish");
  expect(next).toHaveBeenCalledOnce();
  expect(sink.mock.calls[0]?.[0]).toMatchObject({
    route: "apartments",
    status: 200,
  });
  expect(JSON.stringify(sink.mock.calls)).not.toMatch(
    /192\.0\.2|TEST|latitude|authorization|body/,
  );
  expect(r.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});
it("limits a burst before handlers and resets after its window", () => {
  let time = 0;
  const handler = cloudHttpProtection(vi.fn(), () => time),
    next = vi.fn();
  for (let i = 0; i < 50; i++)
    handler(request(), response() as unknown as Response, next);
  const blocked = response();
  handler(request(), blocked as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(50);
  expect(blocked.statusCode).toBe(429);
  time = 1000;
  handler(request(), response() as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(51);
});
it("bounds per-client requests even below the global burst ceiling; health still works", () => {
  let time = 0;
  const sink = vi.fn(),
    next = vi.fn();
  const handler = cloudHttpProtection(sink, () => time);
  for (let i = 0; i < 240; i++) {
    time += 50;
    handler(request(), response() as unknown as Response, next);
  }
  const blocked = response();
  handler(request(), blocked as unknown as Response, next);
  expect(blocked.statusCode).toBe(429);
  const health = response();
  handler(
    request("192.0.2.2", "/health/ready"),
    health as unknown as Response,
    next,
  );
  health.emit("finish");
  expect(health.statusCode).toBe(200);
  expect(sink).not.toHaveBeenCalled();
  for (let i = 0; i < 9; i++)
    handler(
      request("192.0.2.2", "/health/ready"),
      response() as unknown as Response,
      next,
    );
  const excessiveHealth = response();
  handler(
    request("192.0.2.3", "/health/ready"),
    excessiveHealth as unknown as Response,
    next,
  );
  expect(excessiveHealth.statusCode).toBe(429);
  time += 60000;
  const reset = response();
  handler(request(), reset as unknown as Response, next);
  expect(reset.statusCode).toBe(200);
});
