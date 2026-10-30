import { Redirect } from "expo-router";
import CardLab from "../design/CardLab";
// No production route may present synthetic shared records.
export default function DesignLab() {
  return __DEV__ ? <CardLab /> : <Redirect href="/" />;
}
