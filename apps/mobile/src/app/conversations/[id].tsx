import { router, useLocalSearchParams } from "expo-router";
import { RequestGate } from "../../requests/RequestUi";
import { ChatHistory, ChatComposer } from "../../messages/MessageViews";
import { ConversationLayout } from "../../messages/ConversationLayout";
import { useConversation } from "../../messages/useConversation";
export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequestGate title="对话">
      <Chat key={id} id={id} />
    </RequestGate>
  );
}
function Chat({ id }: { id: string }) {
  const p = useConversation(id);
  return (
    <ConversationLayout
      title={p.conversation?.other_profile.display_name ?? "对话"}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/inbox")
      }
      onReload={p.onReload}
    >
      <ChatHistory {...p} />
      <ChatComposer
        {...p}
        readOnlyReason={
          !p.conversation ? (p.busy ? "正在加载…" : "消息暂不可用") : undefined
        }
      />
    </ConversationLayout>
  );
}
