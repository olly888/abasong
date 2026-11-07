import { Redirect } from "expo-router";
import { SelfProfileLab } from "../design/SelfProfileLab";
export default function Lab() {
  return __DEV__ ? <SelfProfileLab /> : <Redirect href="/profile" />;
}
