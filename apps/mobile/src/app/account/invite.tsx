import { useLocalSearchParams } from "expo-router";
import { InviteDriver } from "../../invitation/InviteDriver";

export default function InviteDriverRoute() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  return <InviteDriver localPreview={__DEV__ && preview === "local"} />;
}
