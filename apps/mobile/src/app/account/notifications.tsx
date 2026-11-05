import NotificationSettings from "../../notifications/NotificationSettings";
import { RequestGate } from "../../requests/RequestUi";
export default function Notifications() {
  return (
    <RequestGate title="通知设置">
      <NotificationSettings />
    </RequestGate>
  );
}
