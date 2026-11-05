import { Redirect } from "expo-router";
import DriverDiscoveryLab from "../design/DriverDiscoveryLab";
export default function Lab() {
  return __DEV__ ? <DriverDiscoveryLab /> : <Redirect href="/" />;
}
