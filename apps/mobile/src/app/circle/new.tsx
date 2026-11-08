import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { RequestGate } from "../../requests/RequestUi";
import { useAuth } from "../../auth/AuthProvider";
import { CircleComposer } from "../../circle/CircleComposer";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import { backToCircle } from "../../circle/navigation";
function Composer({
  onPickerActorChange,
}: {
  onPickerActorChange?: (actor: string | null) => void;
}) {
  const { session } = useAuth();
  const request = useBusinessRequest();
  return session ? (
    <CircleComposer
      key={session.user.id}
      request={request}
      actor={session.user.id}
      onPickerActorChange={onPickerActorChange}
      onBack={backToCircle}
      onDone={(post) =>
        router.replace({ pathname: "/circle/[id]", params: { id: post.id } })
      }
    />
  ) : null;
}
function AndroidComposerGate() {
  const { phase, session } = useAuth();
  const [pickerActor, setPickerActor] = useState<string | null>(null);
  const actor = session?.user.id;
  const ready = phase === "ready" && !!actor;
  // The system picker returns in a separate activity. Account revalidation
  // must not abort its result for the same user.
  const returningFromPicker =
    phase === "loading-account" && !!actor && actor === pickerActor;
  return (
    <>
      {ready || returningFromPicker ? (
        <View
          key={actor}
          style={ready ? styles.page : styles.hidden}
          pointerEvents={ready ? "auto" : "none"}
          importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
        >
          <Composer onPickerActorChange={setPickerActor} />
        </View>
      ) : null}
      {!ready ? <RequestGate title="发布动态">{null}</RequestGate> : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  hidden: { display: "none" },
});

export default function Route() {
  if (Platform.OS === "android") return <AndroidComposerGate />;
  return (
    <RequestGate title="发布动态">
      <Composer />
    </RequestGate>
  );
}
