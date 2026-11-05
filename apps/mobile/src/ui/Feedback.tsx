import { ActivityIndicator, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { ActionButton } from "./Controls";
import { typeStyles } from "./foundation";

export function StatusPanel({
  state,
  title,
  description,
  action,
}: {
  state: "loading" | "empty" | "error" | "unavailable";
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
      {state === "loading" ? (
        <ActivityIndicator
          color={tokens.color.brandPrimary}
          accessibilityLabel={title}
        />
      ) : null}
      <Text
        accessibilityRole={state === "error" ? "alert" : undefined}
        style={[
          typeStyles.body,
          {
            textAlign: "center",
            color:
              state === "error"
                ? tokens.color.danger
                : tokens.color.textSecondary,
          },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[typeStyles.secondary, { textAlign: "center" }]}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <ActionButton
          label={action.label}
          variant="secondary"
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}
