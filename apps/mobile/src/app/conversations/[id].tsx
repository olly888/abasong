import { useCallback, useState } from "react";
import { Text } from "react-native";
import { dataRequest } from "../../apartments/client";
import type { ProfileRequest } from "../../profile/profile-session";
import { MyContactSheet } from "../../profile/MyContactSheet";
import { BottomSheet } from "../../ui/BottomSheet";
import { ActionButton } from "../../ui/Controls";
import { IconButton } from "../../ui/Primitives";
import { typeStyles } from "../../ui/foundation";
import { router, useLocalSearchParams } from "expo-router";
import { RequestGate } from "../../requests/RequestUi";
import { ChatHistory, ChatComposer } from "../../messages/MessageViews";
import { ConversationLayout } from "../../messages/ConversationLayout";
import { useConversation } from "../../messages/useConversation";
import { useAuth } from "../../auth/AuthProvider";
export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  return (
    <RequestGate title="对话">
      <Chat key={`${session?.user.id ?? "guest"}:${id}`} id={id} />
    </RequestGate>
  );
}
function Chat({ id }: { id: string }) {
  const p = useConversation(id);
  const { session } = useAuth();
  const [menu, setMenu] = useState(false),
    [contact, setContact] = useState(false);
  const request: ProfileRequest = useCallback(
    (path, options) => dataRequest(session!, path, options),
    [session?.access_token],
  );
  const closeContact = useCallback(() => setContact(false), []);
  return (
    <ConversationLayout
      title={p.conversation?.other_profile.display_name ?? "对话"}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/inbox")
      }
      onReload={p.onReload}
      headerRight={
        <IconButton
          name="list"
          label="会话更多"
          onPress={() => setMenu(true)}
        />
      }
    >
      {menu ? (
        <BottomSheet onRequestClose={() => setMenu(false)}>
          <Text style={typeStyles.title}>更多</Text>
          <ActionButton
            label="我的联系方式"
            secondary
            onPress={() => {
              setMenu(false);
              setContact(true);
            }}
          />
          <ActionButton
            label="刷新会话"
            secondary
            onPress={() => {
              setMenu(false);
              p.onReload();
            }}
          />
          <ActionButton
            label="取消"
            variant="text"
            onPress={() => setMenu(false)}
          />
        </BottomSheet>
      ) : null}
      {contact ? (
        <MyContactSheet request={request} onClose={closeContact} />
      ) : null}
      <ChatHistory {...p} />
      <ChatComposer
        {...p}
        readOnlyReason={
          p.readOnlyReason ??
          (!p.conversation
            ? p.busy
              ? "正在加载…"
              : "消息暂不可用"
            : undefined)
        }
      />
    </ConversationLayout>
  );
}
