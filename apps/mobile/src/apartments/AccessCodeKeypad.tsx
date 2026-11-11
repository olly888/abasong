import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { tokens } from "@abasong/ui";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionButton, FormError } from "../ui/Controls";
import { metrics, typeStyles } from "../ui/foundation";
import {
  accessCodeDraft,
  accessCodeLimit,
  editAccessCode,
  spokenCodeCharacter,
  type CodeDraft,
} from "./access-code-edit";

const digitRows = ["123", "456", "789", "*0#"];

export function AccessCodeKeypad({
  value,
  label,
  address,
  onDone,
}: {
  value: string;
  label: string;
  address?: string;
  onDone: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => accessCodeDraft(value));
  const latest = useRef(draft);
  const open = useRef(true);
  const [letters, setLetters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    open.current = true;
    const listener = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      open.current = false;
      listener.remove();
    };
  }, []);

  function update(next: CodeDraft) {
    latest.current = next;
    setDraft(next);
  }
  function apply(edit: { insert: string } | "delete") {
    const next = editAccessCode(latest.current, edit);
    if (!next) return false;
    setError(null);
    update(next);
    return true;
  }
  function done() {
    if (!open.current) return;
    open.current = false;
    onDone(latest.current.value);
  }
  async function paste() {
    const before = latest.current;
    try {
      const text = await Clipboard.getStringAsync();
      if (!open.current || latest.current !== before) return;
      if (!apply({ insert: text }))
        setError("请粘贴不超过 32 个字符的单行门禁码");
    } catch {
      if (open.current) setError("暂时无法粘贴，请重试");
    }
  }

  return (
    <BottomSheet onRequestClose={done}>
      {active ? (
        <View style={styles.content}>
          <Text style={typeStyles.title}>{label}</Text>
          {address ? <Text style={typeStyles.secondary}>{address}</Text> : null}
          <View style={styles.row}>
            <TextInput
              autoFocus
              showSoftInputOnFocus={false}
              contextMenuHidden
              accessibilityLabel={label}
              accessibilityHint="点按调整光标或选中文字，再用门禁键盘修改"
              value={draft.value}
              selection={draft.selection}
              onSelectionChange={({ nativeEvent: { selection } }) => {
                const previous = latest.current;
                if (
                  selection.end > previous.value.length ||
                  (selection.start === previous.selection.start &&
                    selection.end === previous.selection.end)
                )
                  return;
                update({ ...previous, selection });
              }}
              onChangeText={(text) => {
                setError(null);
                update(accessCodeDraft(text));
              }}
              onSubmitEditing={done}
              maxLength={accessCodeLimit}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="例如 0012#"
              placeholderTextColor={tokens.color.textMuted}
              underlineColorAndroid="transparent"
              style={styles.input}
            />
            <Key label="⌫" spoken="删除" onPress={() => apply("delete")} />
          </View>
          <View style={styles.row}>
            <Key
              label={letters ? "收起字母" : "ABC"}
              spoken={letters ? "收起字母" : "展开字母 A 到 E"}
              expanded={letters}
              onPress={() => setLetters((previous) => !previous)}
            />
            <Key label="粘贴" onPress={() => void paste()} />
          </View>
          {letters ? (
            <View style={styles.row}>
              {Array.from("ABCDE", (character) => (
                <Key
                  key={character}
                  label={character}
                  stretch
                  onPress={() => apply({ insert: character })}
                />
              ))}
            </View>
          ) : null}
          {digitRows.map((row) => (
            <View key={row} style={styles.row}>
              {Array.from(row, (character) => (
                <Key
                  key={character}
                  label={character}
                  spoken={spokenCodeCharacter(character)}
                  stretch
                  onPress={() => apply({ insert: character })}
                />
              ))}
            </View>
          ))}
          <FormError message={error} />
          <ActionButton label="完成" onPress={done} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Key({
  label,
  spoken,
  stretch,
  expanded,
  onPress,
}: {
  label: string;
  spoken?: string;
  stretch?: boolean;
  expanded?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        stretch && styles.stretch,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typeStyles.label, stretch && styles.digit]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: metrics.fieldGap },
  row: { flexDirection: "row", gap: metrics.fieldGap, alignItems: "stretch" },
  input: {
    ...typeStyles.body,
    flex: 1,
    minWidth: 0,
    minHeight: metrics.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: metrics.controlRadius,
    borderColor: tokens.color.focus,
    fontSize: 24,
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  key: {
    minHeight: metrics.touch,
    minWidth: metrics.touch,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: metrics.controlRadius,
    backgroundColor: tokens.color.surfaceMuted,
  },
  stretch: { flex: 1 },
  pressed: { backgroundColor: tokens.color.brandSurface },
  digit: { fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },
});
