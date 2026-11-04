import { expect, it, vi } from "vitest";
import { canSearchPhotoDraft, isCachePhoto } from "./photo-policy";
import { RecognitionGate, recognizeOwned } from "../imports/recognition-work";
it("never searches an unconfirmed photo draft or a photo still being recognized", () => {
  expect(canSearchPhotoDraft("120 Example Ave", true, false)).toBe(false);
  expect(canSearchPhotoDraft("120 Example Ave", false, true)).toBe(false);
  expect(canSearchPhotoDraft("120 Example Ave", false, false)).toBe(true);
  expect(canSearchPhotoDraft(" ", false, false)).toBe(false);
});
it("only allows cleanup of a capture cache copy, never originals or path escapes", () => {
  const root = "file:///private/app/cache/";
  expect(isCachePhoto(root + "ImagePicker/photo.jpg", root)).toBe(true);
  for (const uri of [
    "https://example.com/image.jpg",
    "file:///private/app/photos/a.jpg",
    root + "../photos/a.jpg",
    root + "%2e%2e%2fphotos/a.jpg",
    root + "a.jpg?query=1",
    "file://remote/private/app/cache/a.jpg",
  ])
    expect(isCachePhoto(uri, root)).toBe(false);
});
it("keeps a cancelled OCR input until native work actually ends, then releases it", async () => {
  const gate = new RecognitionGate(),
    controller = new AbortController(),
    release = vi.fn();
  let finish!: (s: string) => void;
  const result = recognizeOwned(
    gate,
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    release,
    controller.signal,
  );
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ code: "OCR_CANCELLED" });
  expect(release).not.toHaveBeenCalled();
  finish("discarded");
  await Promise.resolve();
  expect(release).toHaveBeenCalledTimes(1);
});
it("cleans photos on native failure or when another recognition owns the gate", async () => {
  const gate = new RecognitionGate(),
    release = vi.fn();
  await expect(
    recognizeOwned(
      gate,
      async () => {
        throw new Error("TEST");
      },
      release,
    ),
  ).rejects.toThrow("TEST");
  expect(release).toHaveBeenCalledTimes(1);
  let finish!: () => void;
  const running = gate.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const skipped = vi.fn(),
    work = vi.fn();
  await expect(recognizeOwned(gate, work, skipped)).rejects.toMatchObject({
    code: "OCR_BUSY",
  });
  expect(work).not.toHaveBeenCalled();
  expect(skipped).toHaveBeenCalledTimes(1);
  finish();
  await running;
});
