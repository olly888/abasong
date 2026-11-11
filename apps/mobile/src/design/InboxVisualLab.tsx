import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { InboxContent } from "../messages/InboxScreen";
import { InviteDriver, InvitePoster } from "../invitation/InviteDriver";
import { AccountError } from "../auth/api-client";
import type { ProfileRequest } from "../profile/profile-session";
import { ActionButton } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";

type S = components["schemas"];
const time = "2026-11-08T18:00:00Z";
const conversation: S["Conversation"] = {
  id: "TEST-chat",
  other_profile: {
    user_id: "TEST-peer",
    display_name: "TEST 同行长名字",
    bio: null,
    vehicle_type: null,
    experience: [],
  },
  unread_count: 2,
  last_sequence: 2,
  my_last_read_sequence: 0,
  other_last_read_sequence: 0,
  can_send: true,
  last_request_region_label: null,
  last_request_snapshot: null,
  updated_at: time,
};
const notice: S["Notification"] = {
  id: "TEST-reply",
  kind: "circle_reply",
  object_type: "post",
  object_id: "TEST-post",
  comment_id: "TEST-comment",
  read_at: null,
  created_at: time,
};
export default function InboxVisualLab() {
  const { scene = "ready" } = useLocalSearchParams<{ scene?: string }>();
  return __DEV__ ? <Lab key={scene} scene={scene} /> : <Redirect href="/" />;
}
function Lab({ scene }: { scene: string }) {
  const [opened, setOpened] = useState(0),
    [account, setAccount] = useState("A");
  const request = useMemo<ProfileRequest>(() => {
    let read = false,
      secondRead = false,
      removed = false,
      failed = false,
      denied = false,
      notificationReads = 0;
    return async <T,>(
      path: string,
      options?: Parameters<ProfileRequest>[1],
    ) => {
      if (denied)
        throw new AccountError(403, "TEST_DENIED", "TEST · 资格已失效");
      if (path.endsWith("/read")) {
        if (scene === "denied") {
          denied = true;
          throw new AccountError(403, "TEST_DENIED", "TEST · 资格已失效");
        }
        if (scene === "gone") {
          removed = true;
          throw new AccountError(404, "TEST_GONE", "TEST · 已不可查看");
        }
        if (scene === "retry" && !failed) {
          failed = true;
          throw new Error("TEST · 未能标记已读");
        }
        await new Promise((r) => setTimeout(r, 100));
        if (path.includes("TEST-reply/read")) read = true;
        else secondRead = true;
        return { ok: true } as T;
      }
      if (scene === "load-error" && !failed) {
        failed = true;
        throw new Error("TEST · 消息加载失败");
      }
      if (path.includes("inbox-summary")) {
        const value = {
          unread_messages: account === "A" ? 2 : 0,
          unread_conversations: account === "A" ? 1 : 0,
          unread_notifications:
            account === "A"
              ? Number(!secondRead) + Number(!read && !removed)
              : 0,
          unread_circle_replies:
            account === "A"
              ? Number(!read && !removed) +
                Number(scene === "summary-race" && !secondRead)
              : 0,
        };
        if (scene === "summary-race" && read && !secondRead)
          await new Promise((r) => setTimeout(r, 900));
        return value as T;
      }
      if (path.includes("conversations")) {
        if (scene === "slow" || account === "B")
          await new Promise((r) => setTimeout(r, 700));
        // Deliberately ignore cancellation: the UI must discard late responses.
        return {
          items: account === "A" ? [conversation] : [],
          next_cursor: null,
        } as T;
      }
      if (path.includes("notifications")) {
        const value = {
          items:
            account === "A"
              ? [
                  ...(!removed
                    ? [{ ...notice, read_at: read ? time : null }]
                    : []),
                  {
                    ...notice,
                    id: "TEST-request",
                    kind:
                      scene === "summary-race"
                        ? "circle_reply"
                        : "request_updated",
                    object_type: scene === "summary-race" ? "post" : "request",
                    read_at: secondRead ? time : null,
                    comment_id: undefined,
                  },
                ]
              : [],
          next_cursor: null,
        };
        if (scene === "poll-race" && ++notificationReads === 2)
          await new Promise((r) => setTimeout(r, 900));
        return value as T;
      }
      throw new Error(
        `unexpected TEST route: ${path} ${options?.method ?? "GET"}`,
      );
    };
  }, [scene, account]);
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={["top"]}>
        <Text>
          TEST · M6-02 · {account} · 打开{opened}
        </Text>
        <ActionButton
          variant="text"
          label="切换 TEST 账号"
          onPress={() => {
            setAccount("B");
            setOpened(0);
          }}
        />
      </SafeAreaView>
      {scene === "invite" ? (
        <InviteDriver localPreview={false} />
      ) : scene === "poster" ? (
        <PageFrame compact title="TEST 邀请图">
          <InvitePoster testLabel="TEST · 仅本机测试" />
        </PageFrame>
      ) : (
        <InboxContent
          key={account}
          request={request}
          initialTab={scene === "slow" ? "conversations" : "notifications"}
          onBack={() => setOpened(0)}
          onPost={() => setOpened((v) => v + 1)}
        />
      )}
    </View>
  );
}
