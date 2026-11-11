import { Redirect } from "expo-router";
import DesignSystemLab from "../design/DesignSystemLab";
export default function DesignSystem() {
  return __DEV__ ? <DesignSystemLab /> : <Redirect href="/" />;
}
