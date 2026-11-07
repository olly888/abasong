import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionButton, FormError } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";
import type { ProfileRequest, SelfProfile } from "./profile-session";
// Only this account's optional contact. Opening never sends a message.
export function MyContactSheet({
  request,
  onClose,
}: {
  request: ProfileRequest;
  onClose: () => void;
}) {
  const [value, setValue] = useState<SelfProfile["private_contact"] | null>(
      null,
    ),
    [error, setError] = useState<string | null>(null),
    [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void request<SelfProfile>("/v1/me/profile", { signal: c.signal })
      .then((p) => {
        if (!c.signal.aborted) setValue(p.private_contact);
      })
      .catch(() => {
        if (!c.signal.aborted) setError("联系方式暂时无法读取");
      });
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        c.abort();
        setValue(null);
        onClose();
      }
    });
    return () => {
      c.abort();
      sub.remove();
    };
  }, [request, onClose]);
  async function copy(label: string, text: string) {
    setError(null);
    try {
      if (
        !(await Clipboard.setStringAsync(text, {
          android: { isSensitive: true },
        }))
      )
        throw new Error();
      setCopied(label + "已复制");
    } catch {
      setError("复制失败，请长按选择文字");
    }
  }
  return (
    <BottomSheet onRequestClose={onClose}>
      <Text style={typeStyles.title}>我的联系方式</Text>
      <Text style={typeStyles.secondary}>仅自己可见，复制后可自愿提供。</Text>
      <FormError message={error} />
      {value ? (
        value.phone || value.wechat ? (
          <>
            {(
              [
                ["电话", value.phone],
                ["微信", value.wechat],
              ] as const
            )
              .filter(([, v]) => !!v)
              .map(([label, v]) => (
                <View key={label} style={{ gap: 8 }}>
                  <Text selectable style={typeStyles.body}>
                    {label}：{v}
                  </Text>
                  <ActionButton
                    label={"复制" + label}
                    secondary
                    onPress={() => void copy(label, v)}
                  />
                </View>
              ))}
          </>
        ) : (
          <Text style={typeStyles.body}>尚未填写，可在个人资料中添加。</Text>
        )
      ) : !error ? (
        <Text style={typeStyles.secondary}>正在读取…</Text>
      ) : null}
      {copied ? (
        <Text accessibilityLiveRegion="polite" style={typeStyles.secondary}>
          {copied}
        </Text>
      ) : null}
      <ActionButton label="关闭" variant="text" onPress={onClose} />
    </BottomSheet>
  );
}
