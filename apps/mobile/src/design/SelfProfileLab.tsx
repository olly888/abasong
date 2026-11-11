import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { ActionButton } from "../ui/Controls";
import { MyAccount } from "../profile/MyAccount";
import { ProfileEditor } from "../profile/ProfileEditor";
import { MyContactSheet } from "../profile/MyContactSheet";
import {
  clearProfileDraft,
  type ProfileRequest,
  type SelfProfile,
  profileFields,
} from "../profile/profile-session";
import { AvailabilityFlow } from "../drivers/AvailabilityFlow";
import { AccountError } from "../auth/errors";
const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
const request: ProfileRequest = async <T,>(path:string, o?:Parameters<ProfileRequest>[1]) => {
  const r = await fetch(base + path, {
    method: o?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Abasong-Test-Actor": "owner",
      ...(o?.key ? { "Idempotency-Key": o.key } : {}),
    },
    body: o?.body === undefined ? undefined : JSON.stringify(o.body),
    signal: o?.signal ?? AbortSignal.timeout(15000),
  });
  const v = await r.json();
  if (!r.ok)
    throw new AccountError(r.status, v.code, v.message ?? "TEST failed");
  return v as T;
};
export function SelfProfileLab() {
  const [view, setView] = useState<"my" | "profile" | "availability">("my"),
    [enable, setEnable] = useState(false),
    [revision, setRevision] = useState(0),
    [owner, setOwner] = useState(""),
    [note, setNote] = useState("TEST · B5-01"),
    [contact, setContact] = useState(false);
  useEffect(() => {
    clearProfileDraft();
    void request<{ owner: string }>("/fixture").then((f) => setOwner(f.owner));
    return clearProfileDraft;
  }, []);
  const back = () => {
    setView("my");
    setRevision((n) => n + 1);
  };
  const closeContact = useCallback(() => setContact(false), []);
  const controls = (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12 }}>{note}</Text>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {["我的", "保存重试", "版本变化", "关闭失败", "我的联系方式"].map(
          (label) => (
            <ActionButton
              key={label}
              label={label}
              variant="text"
              onPress={() => {
                if (label === "我的") {
                  back();
                  return;
                }
                if (label === "我的联系方式") {
                  setContact(true);
                  return;
                }
                if (label === "版本变化") {
                  void request<SelfProfile>("/v1/me/profile")
                    .then((p) =>
                      request("/v1/me/profile", {
                        method: "PATCH",
                        key: randomUUID(),
                        body: {
                          ...profileFields(p),
                          expected_version: p.version,
                          bio: "TEST concurrent change",
                        },
                      }),
                    )
                    .then(() => setNote("TEST · 服务端版本已变化"));
                  return;
                }
                void request("/fixture/control", {
                  method: "POST",
                  body: {
                    action: "fault",
                    operation:
                      label === "关闭失败" ? "availability" : "profile",
                    after: label === "保存重试",
                  },
                }).then(() => setNote("TEST · " + label + "已准备"));
              }}
            />
          ),
        )}
      </ScrollView>
    </View>
  );
  if (!owner) return <Text>TEST · 正在连接本机隔离服务</Text>;
  return (
    <>
      {view === "my" ? (
        <MyAccount
          key={revision}
          request={request}
          onProfile={() => setView("profile")}
          onAvailability={(v) => {
            setEnable(v);
            setView("availability");
          }}
          onShare={() => setNote("TEST · 共享入口")}
          onMenu={(m) => setNote("TEST · " + m)}
          testControls={controls}
        />
      ) : view === "profile" ? (
        <ProfileEditor
          request={request}
          owner={owner}
          onBack={back}
          onSaved={(p) => {
            setNote("TEST · 已保存 v" + p.version);
            back();
          }}
          testControls={controls}
        />
      ) : (
        <AvailabilityFlow
          request={request}
          enableOnOpen={enable}
          onSaved={back}
          onCancel={back}
          testControls={controls}
        />
      )}
      {contact ? (
        <MyContactSheet request={request} onClose={closeContact} />
      ) : null}
    </>
  );
}
