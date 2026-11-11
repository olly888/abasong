import { expect, it } from "vitest";
import { createReviewSearch } from "./review-search";
it("discards a late apartment list after switching the open screenshot row", async () => {
  let resolve!: (v: unknown) => void;
  const search = createReviewSearch(
    async <T>() =>
      new Promise<unknown>((yes) => {
        resolve = yes;
      }) as Promise<T>,
  );
  const pending = search.search("row-A", "100 TEST");
  search.cancel();
  resolve({ items: [{ id: "TEST-A" }] });
  expect(await pending).toBeNull();
});
it("does not reuse the old query result when the transport ignores cancellation", async () => {
  const resolve: ((v: unknown) => void)[] = [];
  const search = createReviewSearch(
    async <T>() =>
      new Promise<unknown>((yes) => resolve.push(yes)) as Promise<T>,
  );
  const old = search.search("row-A", "100 TEST");
  const current = search.search("row-B", "102 TEST");
  resolve[1]({ items: [{ id: "TEST-B" }] });
  expect(await current).toMatchObject({
    rowId: "row-B",
    items: [{ id: "TEST-B" }],
  });
  resolve[0]({ items: [{ id: "TEST-A" }] });
  expect(await old).toBeNull();
});
it("ignores a late failure after closing the editor", async () => {
  let reject!: (e: Error) => void;
  const search = createReviewSearch(
    async () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  const old = search.search("row-A", "100 TEST");
  search.cancel();
  reject(new Error("TEST offline"));
  expect(await old).toBeNull();
});
