import { expect, it } from "vitest";
import { copyThenRelease } from "./copy-selection";
it("does not delete the source while an asynchronous image copy is in flight", async () => {
  let finish!: () => void,
    deleted = false;
  const promise = copyThenRelease(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    () => {
      deleted = true;
    },
  );
  expect(deleted).toBe(false);
  finish();
  await promise;
  expect(deleted).toBe(true);
});
it("preserves the readable source if copying fails", async () => {
  let deleted = false;
  await expect(
    copyThenRelease(
      async () => {
        throw new Error("copy failed");
      },
      () => {
        deleted = true;
      },
    ),
  ).rejects.toThrow("copy failed");
  expect(deleted).toBe(false);
});
