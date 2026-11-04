import { Redirect } from "expo-router";
import MessageLab from "../design/MessageLab";
export default function MessagingLab() {
  return __DEV__ ? <MessageLab /> : <Redirect href="/" />;
}
