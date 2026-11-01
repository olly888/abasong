import { requireOptionalNativeModule } from "expo";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { recognize } from "../imports/recognize";
import { RecognitionError } from "../imports/recognition-work";
import { extractLabelAddresses, type LabelAddress } from "./extract";
import { isCachePhoto } from "./photo-policy";

export class PhotoError extends Error {
  constructor(
    message: string,
    readonly settings = false,
  ) {
    super(message);
  }
}
export type CaptureAddress = (
  signal: AbortSignal,
  recognizing: () => void,
) => Promise<LabelAddress[] | null>;
let cameraOpen: symbol | null = null;
export const captureAddress: CaptureAddress = async (signal, recognizing) => {
  const native = requireOptionalNativeModule<{ addressCameraVersion?: number }>(
    "AbasongOcr",
  );
  if (Platform.OS === "web" || native?.addressCameraVersion !== 1)
    throw new PhotoError("请更新手机应用后使用拍面单查地址");
  if (cameraOpen) throw new PhotoError("相机正在打开，请稍后重试");
  let release = () => {};
  let handedToOcr = false;
  const lease = Symbol();
  cameraOpen = lease;
  try {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (signal.aborted) return null;
    if (!permission.granted && permission.canAskAgain)
      permission = await ImagePicker.requestCameraPermissionsAsync();
    if (signal.aborted) return null;
    if (!permission.granted)
      throw new PhotoError("需要相机权限才能拍面单", !permission.canAskAgain);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: false,
      quality: 0.9,
      exif: false,
      base64: false,
    });
    if (cameraOpen === lease) cameraOpen = null;
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];
    if (!isCachePhoto(asset.uri, Paths.cache.uri))
      throw new PhotoError("无法读取照片，请重新拍照");
    const file = new File(asset.uri);
    release = () => {
      try {
        if (file.exists) file.delete();
      } catch {
        /* OS cache eviction remains a fallback after an I/O failure. */
      }
    };
    if (signal.aborted) return null;
    if (
      !file.exists ||
      file.size <= 0 ||
      file.size > 10 * 1024 * 1024 ||
      !Number.isFinite(asset.width * asset.height) ||
      asset.width <= 0 ||
      asset.height <= 0 ||
      asset.width * asset.height > 24_000_000
    )
      throw new PhotoError("照片过大，请降低相机分辨率后重拍");
    recognizing();
    handedToOcr = true;
    const lines = await recognize(asset.uri, signal, release);
    return signal.aborted ? null : extractLabelAddresses(lines);
  } catch (error) {
    if (signal.aborted) return null;
    if (error instanceof PhotoError) throw error;
    if (error instanceof RecognitionError)
      throw new PhotoError(
        error.code === "OCR_BUSY"
          ? "上一张照片仍在处理，请稍后重拍"
          : "识别时间较长，请重新拍照或手动输入",
      );
    throw new PhotoError("无法识别照片，请重新拍照或手动输入");
  } finally {
    if (cameraOpen === lease) cameraOpen = null;
    if (!handedToOcr) release();
  }
};
