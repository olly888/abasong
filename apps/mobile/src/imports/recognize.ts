import { requireOptionalNativeModule } from "expo";
import type { OcrLine } from "./extract";
export async function recognize(uri: string): Promise<OcrLine[]> {
  const module = requireOptionalNativeModule<{
    recognize: (uri: string) => Promise<OcrLine[]>;
  }>("AbasongOcr");
  if (!module) throw new Error("当前安装版本尚不支持截图识别，请更新应用");
  return module.recognize(uri);
}
