import { useRef, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import {
  Asset as PhotoAsset,
  requestPermissionsAsync,
} from "expo-media-library";
import { tokens } from "@abasong/ui";
import { ActionButton, FormError } from "../ui/Controls";
import { metrics, typeStyles } from "../ui/foundation";
import { Icon, type IconName } from "../ui/Icon";
import { BrandWordmark } from "../ui/BrandWordmark";
import { PageFrame } from "../ui/PageFrame";
import type { getInviteKit } from "./invite-policy";
import content from "./poster-content.json";

// Metro resolves packaged images to native asset IDs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const scene = require("./assets/scene.png");
// Literal dev-only dependencies let Metro drop both artifacts and the loopback URL.
const localKit: typeof getInviteKit | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./invite-policy").getInviteKit
  : null;
const localPoster: number | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./assets/abasong-invite-test.png")
  : null;
const inviteTitle = "Abasong｜跑配送的同行，一起少走弯路";
const benefitIcons = [
  "pin",
  "plus",
  "people",
] as const satisfies readonly IconName[];
type Operation = "share" | "save" | "copy";
type Message = { type: "info" | "error" | "copy-fallback"; text: string };
const errors: Record<Operation, Message> = {
  share: { type: "error", text: "暂时无法分享，可复制文案或保存邀请图。" },
  save: { type: "error", text: "邀请图未保存，请重试。" },
  copy: { type: "copy-fallback", text: "复制未成功，可长按选择文案与链接。" },
};

export function InviteDriver({ localPreview }: { localPreview: boolean }) {
  const kit = localKit?.({
    dev: __DEV__,
    localPreview,
    native: Platform.OS === "ios" || Platform.OS === "android",
  });
  const active = useRef(false);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [previewError, setPreviewError] = useState(false);

  async function run(op: Operation) {
    if (!__DEV__ || !kit || active.current) return;
    active.current = true;
    setBusy(op);
    setMessage(null);
    try {
      if (op === "share") {
        // Both platforms receive the exact same text and URL. Dismissing the
        // sheet or the Android callback never implies that anything was sent.
        await Share.share({ title: inviteTitle, message: kit.text });
      } else if (op === "copy") {
        if (!(await Clipboard.setStringAsync(kit.text))) throw new Error();
        setMessage({ type: "info", text: "文案与链接已复制。" });
      } else {
        const needsWritePermission =
          Platform.OS === "ios" ||
          (Platform.OS === "android" && Number(Platform.Version) < 29);
        if (
          needsWritePermission &&
          !(await requestPermissionsAsync(true, [])).granted
        ) {
          setMessage({
            type: "error",
            text: "未允许保存图片，仍可分享或复制链接。",
          });
          return;
        }
        // Android uses MediaStore for the new image, without requesting
        // permission to read the driver's photos.
        if (localPoster === null) throw new Error();
        const asset = await Asset.fromModule(localPoster).downloadAsync();
        if (!asset.localUri) throw new Error();
        const file = new File(Paths.cache, "Abasong-Invite-TEST.png");
        try {
          if (file.exists) file.delete();
          new File(asset.localUri).copy(file);
          await PhotoAsset.create(file.uri);
        } finally {
          try {
            if (file.exists) file.delete();
          } catch {
            // Failure to clear the app's cache is not a photo write failure.
          }
        }
        setMessage({ type: "info", text: "邀请图已保存到照片。" });
      }
    } catch {
      setMessage(errors[op]);
    } finally {
      active.current = false;
      setBusy(null);
    }
  }

  return (
    <PageFrame
      title="邀请司机"
      compact
      backgroundColor={tokens.color.surfaceMuted}
    >
      <View style={s.stack}>
        <View style={s.poster}>
          <BrandWordmark />
          <Text accessibilityRole="header" style={s.headline}>
            {content.firstLine}
            {"\n"}
            {content.secondLine}
            <Text style={s.blue}>{content.highlight}</Text>
          </Text>
          <Image
            source={scene}
            resizeMode="contain"
            style={s.scene}
            accessible={false}
          />
          <View style={s.benefits}>
            {content.benefits.map((benefit, i) => (
              <View key={benefit} style={s.benefit}>
                <Icon
                  name={benefitIcons[i]!}
                  size={17}
                  color={tokens.color.brandPrimary}
                />
                <Text style={typeStyles.label}>{benefit}</Text>
              </View>
            ))}
          </View>
          {__DEV__ && kit ? (
            <View style={s.qrRow}>
              <Image
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep the TEST QR inside the development-only branch
                source={require("./assets/qr-test.png")}
                style={s.qr}
                accessibilityLabel="本机测试邀请二维码"
                accessible
              />
              <View style={s.qrText}>
                <Text style={typeStyles.label}>{content.scan}</Text>
                <Text style={typeStyles.metadata}>{content.scanCaption}</Text>
                <Text style={s.testLabel}>{kit.label}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <Text style={s.note}>{content.source}</Text>
        {kit ? (
          <View style={s.operations}>
            <ActionButton
              label="分享邀请"
              onPress={() => void run("share")}
              busy={busy === "share"}
              disabled={busy !== null && busy !== "share"}
            />
            <View style={s.secondary}>
              <View style={s.operation}>
                <ActionButton
                  label="保存邀请图"
                  variant="text"
                  onPress={() => void run("save")}
                  busy={busy === "save"}
                  disabled={busy !== null && busy !== "save"}
                />
              </View>
              <View style={s.operation}>
                <ActionButton
                  label="复制文案与链接"
                  variant="text"
                  onPress={() => void run("copy")}
                  busy={busy === "copy"}
                  disabled={busy !== null && busy !== "copy"}
                />
              </View>
            </View>
            {message?.type === "info" ? (
              <Text accessibilityLiveRegion="polite" style={s.note}>
                {message.text}
              </Text>
            ) : message ? (
              <FormError message={message.text} />
            ) : null}
            {message?.type === "copy-fallback" ? (
              <Text selectable style={s.selectable}>
                {kit.text}
              </Text>
            ) : null}
            <ActionButton
              label="预览接收邀请页"
              secondary
              onPress={() => {
                setPreviewError(false);
                void Linking.openURL(kit.url).catch(() =>
                  setPreviewError(true),
                );
              }}
              disabled={busy !== null}
            />
            {previewError ? (
              <FormError message="无法打开邀请页，请重试。" />
            ) : null}
          </View>
        ) : (
          <View style={s.closed}>
            <Text style={typeStyles.label}>内测准备中，暂未开放邀请分享。</Text>
          </View>
        )}
      </View>
    </PageFrame>
  );
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  poster: {
    backgroundColor: tokens.color.surface,
    padding: metrics.inset,
    borderRadius: metrics.cardRadius,
    gap: 14,
  },
  headline: { ...typeStyles.title, fontWeight: "700", marginTop: 3 },
  blue: { color: tokens.color.brandText },
  scene: { width: "100%", aspectRatio: 3.1 },
  benefits: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: 10,
    rowGap: 6,
  },
  benefit: { flexDirection: "row", alignItems: "center", gap: 4 },
  qrRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
    paddingTop: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  qr: { width: 104, height: 104 },
  qrText: { flex: 1, gap: 5, alignItems: "flex-start" },
  testLabel: {
    ...typeStyles.metadata,
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: 5,
    paddingHorizontal: 6,
  },
  note: { ...typeStyles.metadata, textAlign: "center" },
  operations: { gap: 5 },
  secondary: { flexDirection: "row", gap: 8 },
  operation: { flex: 1 },
  selectable: {
    ...typeStyles.body,
    padding: 12,
    backgroundColor: tokens.color.surface,
    borderRadius: metrics.cardRadius,
  },
  closed: {
    padding: 14,
    backgroundColor: tokens.color.surface,
    borderRadius: metrics.cardRadius,
  },
});
