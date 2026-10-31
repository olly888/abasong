import { requireOptionalNativeModule } from "expo";
import type { OcrLine } from "./extract";
import { RecognitionGate } from "./recognition-work";
const gate = new RecognitionGate();
export async function recognize(
  uri: string,
  signal?: AbortSignal,
): Promise<OcrLine[]> {
  const module = requireOptionalNativeModule<{
    recognize: (uri: string) => Promise<OcrLine[]>;
  }>("AbasongOcr");
  if (!module) throw new Error("当前安装版本尚不支持截图识别，请更新应用");
  return gate.run(() => module.recognize(uri), signal);
}
