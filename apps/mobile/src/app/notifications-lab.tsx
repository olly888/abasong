import { Redirect } from "expo-router";
import NotificationLab from "../design/NotificationLab";
export default function Lab() {
  return __DEV__ ? <NotificationLab /> : <Redirect href="/" />;
}
