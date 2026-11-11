import { RequestGate } from "../requests/RequestUi";
import InboxScreen from "../messages/InboxScreen";
export default function Inbox() {
  return (
    <RequestGate title="消息">
      <InboxScreen />
    </RequestGate>
  );
}
