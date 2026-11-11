import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { SensitiveScreen } from "../apartments/SensitiveScreen";
import { AuthResolution } from "../auth/AuthControls";
import { keepImportSession } from "../imports/session-gate";

// The native camera temporarily backgrounds Android. Cover address state but
// retain the pending capture; verified logout/account failure still unmounts it.
export function PhotoSessionBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  if (!keepImportSession(auth))
    return <SensitiveScreen>{null}</SensitiveScreen>;
  const covered = !active || !focused || auth.phase !== "ready";
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={covered ? "none" : "auto"}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {covered ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tokens.color.surface },
          ]}
          pointerEvents="auto"
        >
          {auth.phase === "error" ? <AuthResolution /> : null}
        </View>
      ) : null}
    </View>
  );
}
