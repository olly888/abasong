import { Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { getNearbyContribution } from "../../apartments/nearby-contribution";
import { dataRequest } from "../../apartments/client";
import { ContributionForm } from "../../apartments/ContributionForm";
export default function Contribute() {
  const a = useAuth();
  return (
    <SensitiveScreen>
      <Content key={a.session?.user.id} />
    </SensitiveScreen>
  );
}
function Content() {
  const a = useAuth(),
    session = a.session!;
  const params = useLocalSearchParams<{
    mode?: string;
    apartment_id?: string;
    nearby_key?: string;
  }>();
  const initial = getNearbyContribution(params.nearby_key, session.user.id);
  return (
    <ContributionForm
      key={[params.mode, params.apartment_id, params.nearby_key].join(":")}
      initialPrivate={params.mode === "private"}
      initialApartmentId={params.apartment_id}
      initialAddress={initial?.address}
      canContribute={!!a.me?.capabilities.includes("access.contribute")}
      request={(path, options) => dataRequest(session, path, options)}
      onPrivateSaved={() => router.replace("/apartments/library")}
      onShared={(id, outcome) => {
        Alert.alert(
          outcome === "created_pending" ? "历史贡献尚未发布" : "已共享",
          outcome === "same_value_validation"
            ? "已有相同门禁码，已记录你的贡献。"
            : undefined,
        );
        router.replace({ pathname: "/", params: { apartment_id: id } });
      }}
    />
  );
}
