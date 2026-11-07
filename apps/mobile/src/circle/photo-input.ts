import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { isCachePhoto } from "../address-photo/photo-policy";
import { AccountError } from "../auth/api-client";
import type { Circle, CircleRequest } from "./session";

export const photoLimit = 3;
const maxBytes = 5 * 1024 * 1024;
export type CirclePhoto = {
  uri: string;
  upload: string;
  ready?: Circle["CircleMediaUpload"];
};

export function disposePhoto(uri: string) {
  if (Platform.OS === "web" || !isCachePhoto(uri, Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // It is already in the app's cache, where the OS can evict it.
  }
}

export class PhotoInputError extends Error {
  constructor(
    message: string,
    readonly settings = false,
  ) {
    super(message);
  }
}
export async function selectCirclePhotos(
  camera: boolean,
  slots: number,
  signal: AbortSignal,
): Promise<{ photos: CirclePhoto[]; rejected: number }> {
  const options = {
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: 0.78,
    exif: false,
  };
  if (camera) {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (signal.aborted) return { photos: [], rejected: 0 };
    if (!permission.granted && permission.canAskAgain)
      permission = await ImagePicker.requestCameraPermissionsAsync();
    if (signal.aborted) return { photos: [], rejected: 0 };
    if (!permission.granted)
      throw new PhotoInputError(
        "请允许相机权限后拍照",
        !permission.canAskAgain,
      );
  }
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: slots,
        shouldDownloadFromNetwork: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
  if (result.canceled) return { photos: [], rejected: 0 };
  const photos: CirclePhoto[] = [];
  let rejected = 0;
  for (const a of result.assets) {
    try {
      if (
        signal.aborted ||
        photos.length >= slots ||
        !isCachePhoto(a.uri, Paths.cache.uri)
      )
        throw new Error();
      const file = new File(a.uri);
      if (
        !file.exists ||
        !file.size ||
        file.size > maxBytes ||
        !(a.width > 0 && a.height > 0 && a.width * a.height <= 24_000_000)
      )
        throw new Error();
      photos.push({ uri: a.uri, upload: randomUUID() });
    } catch {
      disposePhoto(a.uri);
      rejected++;
    }
  }
  return { photos, rejected };
}

export async function uploadCirclePhoto(
  request: CircleRequest,
  photo: CirclePhoto,
  signal: AbortSignal,
): Promise<CirclePhoto & { ready: Circle["CircleMediaUpload"] }> {
  let upload = photo.upload;
  const file = new File(photo.uri);
  if (!file.exists || !file.size || file.size > maxBytes)
    throw new PhotoInputError("无法读取这张图片，请移除后重新选择");
  const raw = await file.arrayBuffer();
  async function put() {
    return request<Circle["CircleMediaUpload"]>(
      `/v1/me/circle-media/${upload}`,
      {
        method: "PUT",
        raw,
        signal,
      },
    );
  }
  try {
    const ready = await put();
    return { ...photo, upload, ready };
  } catch (error) {
    if (
      !(error instanceof AccountError) ||
      error.status !== 410 ||
      signal.aborted
    )
      throw error;
    upload = randomUUID();
    return { ...photo, upload, ready: await put() };
  }
}
