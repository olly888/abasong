import { requireOptionalNativeModule } from "expo";
import type { OcrLine } from "./extract";
import { RecognitionGate, recognizeOwned } from "./recognition-work";
const gate = new RecognitionGate();
export async function recognize(
  uri: string,
  signal?: AbortSignal,
  release?: () => void,
  mode: "address" | "carrier" = "address",
): Promise<OcrLine[]> {
  const module = requireOptionalNativeModule<{
    carrierScreenshotVersion?: number;
    recognize: (uri: string, carrier?: boolean) => Promise<OcrLine[]>;
  }>("AbasongOcr");
  if (!module) {
    release?.();
    throw new Error("当前安装版本尚不支持截图识别，请更新应用");
  }
  const work = () =>
    mode === "carrier" && module.carrierScreenshotVersion
      ? module.recognize(uri, true)
      : module.recognize(uri);
  return release
    ? recognizeOwned(gate, work, release, signal)
    : gate.run(work, signal);
}
