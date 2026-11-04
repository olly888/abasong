import { Redirect } from "expo-router";
import ArrivalLab from "../design/ArrivalLab";
export default function Lab() {
  return __DEV__ ? <ArrivalLab /> : <Redirect href="/" />;
}
