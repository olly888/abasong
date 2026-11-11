import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { dataRequest } from "../../apartments/client";
import { CorrectionForm } from "../../apartments/CorrectionForm";
export default function ContributionCorrection() {
  const p = useLocalSearchParams<{ source_id?: string }>(),
    auth = useAuth();
  const canReadOriginal = !!auth.me?.capabilities.includes("access.read");
  return (
    <SensitiveScreen>
      {auth.session ? (
        <CorrectionForm
          key={auth.session.user.id + ":" + p.source_id + ":" + canReadOriginal}
          id={typeof p.source_id === "string" ? p.source_id : ""}
          canReadOriginal={canReadOriginal}
          request={(path, options) => dataRequest(auth.session!, path, options)}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/apartments/library");
          }}
          onSaved={() =>
            router.dismissTo({
              pathname: "/apartments/library",
              params: { tab: "shared", revision: randomUUID() },
            })
          }
        />
      ) : null}
    </SensitiveScreen>
  );
}
