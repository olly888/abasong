import { describe, expect, it } from "vitest";
import { coreVisibleKeys, type ResultGeometry } from "./home-core-visibility";
import { homeResultLayout as layout } from "./home-result-layout";
import {
  createVisibleAccessReader,
  type AccessRowState,
} from "../apartments/visible-access-reader";
import type { components } from "@abasong/contracts";
type AccessList = components["schemas"]["AccessList"];
const geometry = () =>
  new Map<string, ResultGeometry>([
    ["100", { row: { y: 4, height: 180 }, core: { y: 71, height: 48 } }],
    ["102", { row: { y: 196, height: 180 }, core: { y: 71, height: 48 } }],
    ["104", { row: { y: 388, height: 180 }, core: { y: 71, height: 48 } }],
  ]);
const keys = ["100", "102", "104"];
describe("DTL-03 actual core visibility", () => {
  it("allows a naturally visible second compact card to read its own code", () => {
    const core = {
      y:
        1 +
        layout.compactBlockInset +
        layout.compactTitle +
        layout.compactSlotGap,
      height: layout.core,
    };
    const rows = new Map(
      keys.map((key, index) => [
        key,
        {
          row: {
            y: layout.listTop + index * (layout.card + layout.rowGap),
            height: layout.card,
          },
          core,
        },
      ]),
    );
    const secondCore = rows.get("102")!.row.y + core.y;
    expect(coreVisibleKeys(keys, rows, 0, secondCore)).toEqual(["100"]);
    expect(coreVisibleKeys(keys, rows, 0, secondCore + 24)).toEqual([
      "100",
      "102",
    ]);
  });
  it("does not read a second title preview or a tiny core sliver", () => {
    expect(coreVisibleKeys(keys, geometry(), 0, 240)).toEqual(["100"]);
    expect(coreVisibleKeys(keys, geometry(), 0, 290)).toEqual(["100"]);
    expect(coreVisibleKeys(keys, geometry(), 0, 291)).toEqual(["100", "102"]);
  });
  it("stops reading when only a footer remains and restores the scrolled row", () => {
    expect(coreVisibleKeys(keys, geometry(), 120, 240)).toEqual(["102"]);
    expect(coreVisibleKeys(keys, geometry(), 192, 240)).toEqual(["102"]);
    expect(coreVisibleKeys(keys, geometry(), 384, 184)).toEqual(["104"]);
  });
  it("uses measured large-text geometry, including headers and multi-line cores", () => {
    const rows = new Map<string, ResultGeometry>([
      ["100", { row: { y: 84, height: 900 }, core: { y: 200, height: 550 } }],
    ]);
    expect(coreVisibleKeys(keys, rows, 0, 240)).toEqual([]);
    expect(coreVisibleKeys(keys, rows, 300, 144)).toEqual(["100"]);
    expect(coreVisibleKeys(keys, rows, 834, 144)).toEqual([]);
  });
  it("never guesses geometry before measurement or retains removed data", () => {
    expect(coreVisibleKeys(keys, new Map(), 0, 240)).toEqual([]);
    expect(coreVisibleKeys([], geometry(), 0, 240)).toEqual([]);
    expect(coreVisibleKeys(keys, geometry(), 0, 0)).toEqual([]);
    expect(coreVisibleKeys(keys, geometry(), NaN, 240)).toEqual([]);
  });
  it("evicts offscreen bodies and rejects late results across scrolling/mode return", async () => {
    let state: ReadonlyMap<string, AccessRowState> = new Map();
    const requests: {
      id: string;
      signal: AbortSignal;
      resolve: (v: AccessList) => void;
    }[] = [];
    const reader = createVisibleAccessReader(
      (id, signal) =>
        new Promise((resolve) => {
          requests.push({ id, signal, resolve });
        }),
      (next) => {
        state = next;
      },
    );
    const move = (offset: number) =>
      reader.update(coreVisibleKeys(keys, geometry(), offset, 240), true);
    const empty: AccessList = {
      items: [],
      config_version: 1,
      next_cursor: null,
    };
    move(0);
    expect(requests.map((r) => r.id)).toEqual(["100"]);
    move(192);
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(requests.map((r) => r.id)).toEqual(["100", "102"]);
    requests[1]!.resolve(empty);
    requests[0]!.resolve(empty); // Transport deliberately ignores cancellation.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect([...state.keys()]).toEqual(["102"]);
    reader.update([], true); // leave mode
    expect(state.size).toBe(0);
    move(192); // restored offset, title 104 still does not read
    expect(requests.map((r) => r.id)).toEqual(["100", "102", "102"]);
    reader.dispose();
  });
});
