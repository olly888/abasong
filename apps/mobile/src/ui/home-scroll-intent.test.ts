import { expect, it } from "vitest";
import { createHomeScrollIntent } from "./home-scroll-intent";

it("recognizes wheel and continued momentum without another drag event", () => {
  const intent = createHomeScrollIntent();
  expect(intent.observe(0)).toBe(false);
  expect(intent.observe(80)).toBe(true);
  expect(intent.observe(80)).toBe(false);
  expect(intent.observe(192)).toBe(true);
});
it("does not claim restoration or an explicit target jump as user scrolling", () => {
  const intent = createHomeScrollIntent();
  intent.align(192);
  expect(intent.observe(100)).toBe(false);
  expect(intent.observe(192)).toBe(false);
  expect(intent.observe(240)).toBe(true);
});
it("allows a real drag to interrupt an unfinished programmatic jump", () => {
  const intent = createHomeScrollIntent();
  intent.align(384);
  intent.begin();
  expect(intent.observe(90)).toBe(true);
  expect(intent.observe(NaN)).toBe(false);
});
