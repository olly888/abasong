export class RecognitionError extends Error {
  constructor(readonly code: "OCR_CANCELLED" | "OCR_TIMEOUT" | "OCR_BUSY") {
    super(
      code === "OCR_CANCELLED"
        ? "已停止识别"
        : code === "OCR_TIMEOUT"
          ? "这张截图识别超时，可稍后重试"
          : "上一张截图仍在处理，请稍后重试",
    );
  }
}
// Cancelling the JS wait cannot cancel Vision/ML Kit work. Keep the native slot
// occupied until it actually settles, discard late results and forbid overlap.
export class RecognitionGate {
  private pending: Promise<unknown> | null = null;
  async run<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
    timeoutMs = 60000,
  ): Promise<T> {
    if (signal?.aborted) throw new RecognitionError("OCR_CANCELLED");
    if (this.pending) throw new RecognitionError("OCR_BUSY");
    const operation = Promise.resolve().then(() => {
      if (signal?.aborted) throw new RecognitionError("OCR_CANCELLED");
      return work();
    });
    this.pending = operation;
    const clear = () => {
      if (this.pending === operation) this.pending = null;
    };
    void operation.then(clear, clear);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          cancel = () => reject(new RecognitionError("OCR_CANCELLED"));
          signal?.addEventListener("abort", cancel, { once: true });
          timer = setTimeout(
            () => reject(new RecognitionError("OCR_TIMEOUT")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
}
export async function runRecognitionBatch<T, R>(
  items: T[],
  signal: AbortSignal,
  work: (item: T, signal: AbortSignal) => Promise<R>,
  events: {
    start: (item: T) => void;
    result: (item: T, result: R) => void;
    failed: (item: T, error: unknown) => void;
    paused: (item: T) => void;
    progress: (finished: number, total: number) => void;
  },
) {
  let finished = 0;
  events.progress(0, items.length);
  for (const item of items) {
    if (signal.aborted) return { finished, stopped: true };
    events.start(item);
    try {
      const result = await work(item, signal);
      if (signal.aborted) {
        events.paused(item);
        return { finished, stopped: true };
      }
      events.result(item, result);
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof RecognitionError && error.code === "OCR_BUSY")
      ) {
        events.paused(item);
        return { finished, stopped: true };
      }
      events.failed(item, error);
    }
    events.progress(++finished, items.length);
  }
  return { finished, stopped: signal.aborted };
}
