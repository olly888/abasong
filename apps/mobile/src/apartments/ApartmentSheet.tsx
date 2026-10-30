import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton } from "../auth/AuthControls";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/Primitives";
import {
  anchorOffset,
  localTime,
  methodLabel,
  scopeLabel,
  type Anchor,
} from "./presentation";
type S = components["schemas"];
export type SheetProps = {
  apartment: S["Apartment"];
  records: S["AccessRecord"][];
  status: "loading" | "ready" | "denied" | "error";
  expanded: boolean;
  saved: boolean;
  bookmarkBusy?: boolean;
  feedbackBusy?: string | null;
  error?: string | null;
  onExpand: (v: boolean) => void;
  onAdd: () => void;
  onOther: () => void;
  onRetry: () => void;
  onBookmark: () => void;
  onFeedback: (
    r: S["AccessRecord"],
    v: "useful" | "not_useful",
  ) => Promise<boolean>;
  onHeight?: (height: number) => void;
};
export function ApartmentSheet(p: SheetProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    positions = useRef<Record<string, number>>({}),
    offset = useRef(0),
    anchor = useRef<Anchor | null>(null),
    mounted = useRef(true);
  const [contentHeight, setContentHeight] = useState(210);
  const [largeId, setLargeId] = useState<string | null>(null);
  const canRead = p.status === "ready",
    records = canRead ? p.records : [],
    large = canRead ? records.find((r) => r.id === largeId) : undefined;
  const current = useRef(p);
  current.current = p;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24) current.current.onExpand(true);
        else if (g.dy > 24) current.current.onExpand(false);
      },
    }),
  ).current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canRead) setLargeId(null);
  }, [canRead]);
  useEffect(() => {
    let second = 0;
    const frame = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (anchor.current) {
          const y = anchorOffset(anchor.current, positions.current);
          if (y !== null) scroll.current?.scrollTo({ y, animated: false });
          anchor.current = null;
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(second);
    };
  }, [p.records]);
  async function vote(r: S["AccessRecord"], value: "useful" | "not_useful") {
    anchor.current = {
      id: r.id,
      viewportY: (positions.current[r.id] ?? 0) - offset.current,
    };
    const ok = await p.onFeedback(r, value);
    if (!ok && mounted.current) anchor.current = null;
  }
  function code(r: S["AccessRecord"], big = false) {
    return (
      <Pressable
        focusable
        accessibilityRole="button"
        accessibilityLabel={
          r.method === "keypad" ? `密码 ${r.value}，放大查看` : "放大进入方式"
        }
        onPress={() => setLargeId(r.id)}
      >
        <Text style={big ? styles.code : styles.recordCode}>
          {r.method === "keypad" ? r.value : methodLabel(r)}
        </Text>
        {r.method !== "keypad" ? (
          <Text style={styles.body}>{r.value}</Text>
        ) : null}
      </Pressable>
    );
  }
  return (
    <View
      onLayout={(e) => p.onHeight?.(e.nativeEvent.layout.height)}
      style={[
        styles.panel,
        { height: contentHeight + 37 },
        p.expanded && styles.expanded,
      ]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          focusable
          accessibilityRole="button"
          accessibilityLabel={p.expanded ? "收起卡片" : "展开卡片"}
          accessibilityState={{ expanded: p.expanded }}
          onPress={() => p.onExpand(!p.expanded)}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        keyboardShouldPersistTaps="handled"
        ref={scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.inner}
      >
        <View style={styles.heading}>
          <Pressable
            focusable
            accessibilityRole="button"
            accessibilityLabel={p.expanded ? "收起公寓详情" : "展开公寓详情"}
            onPress={() => p.onExpand(!p.expanded)}
            style={{ flex: 1, gap: 4, minHeight: 48 }}
          >
            <Text style={styles.title}>{p.apartment.name ?? "公寓"}</Text>
            <Text style={styles.body}>
              {p.apartment.address_line1}, {p.apartment.city},{" "}
              {p.apartment.state}
            </Text>
          </Pressable>
          {p.expanded ? (
            <>
              <IconButton
                name="down"
                label="收起密码记录"
                onPress={() => p.onExpand(false)}
              />
              <IconButton
                name="bookmark"
                label={p.saved ? "取消收藏公寓" : "收藏公寓"}
                selected={p.saved}
                disabled={p.bookmarkBusy}
                onPress={p.onBookmark}
              />
            </>
          ) : null}
        </View>
        {p.status === "loading" ? (
          <View style={styles.state}>
            <ActivityIndicator color={tokens.color.brandPrimary} />
            <Text style={styles.meta}>正在读取</Text>
          </View>
        ) : null}
        {p.status === "denied" ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>暂未获得资料查看资格</Text>
          </View>
        ) : null}
        {p.status === "error" ? (
          <View style={styles.state}>
            <Text accessibilityRole="alert" style={styles.body}>
              暂时无法读取密码
            </Text>
            <ActionButton label="重新读取" onPress={p.onRetry} />
          </View>
        ) : null}
        {p.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {p.error}
          </Text>
        ) : null}
        {canRead && !records.length ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>暂无共享密码</Text>
            {!p.expanded ? (
              <ActionButton label="添加密码" onPress={p.onAdd} />
            ) : null}
          </View>
        ) : null}
        {canRead && !p.expanded && records[0] ? (
          <>
            {code(records[0], true)}
            <Text style={styles.meta}>
              {localTime(records[0].contributed_at, records[0].scope.timezone)}{" "}
              贡献
            </Text>
            <Pressable
              focusable
              accessibilityRole="button"
              style={styles.linkRow}
              onPress={() => p.onExpand(true)}
            >
              <Text style={styles.link}>查看 {records.length} 条进入信息</Text>
              <Icon name="up" size={18} color={tokens.color.brandPrimary} />
            </Pressable>
          </>
        ) : null}
        {p.expanded ? (
          <>
            <View style={{ paddingTop: 18, paddingBottom: 14 }}>
              <ActionButton label="＋ 添加密码" onPress={p.onAdd} />
            </View>
            {records.map((r) => (
              <View
                key={r.id}
                onLayout={(e) => {
                  positions.current[r.id] = e.nativeEvent.layout.y;
                  if (anchor.current?.id === r.id) {
                    const y = anchorOffset(anchor.current, positions.current);
                    if (y !== null)
                      scroll.current?.scrollTo({ y, animated: false });
                  }
                }}
                style={styles.record}
              >
                <View style={styles.recordTop}>
                  <View style={{ flex: 1 }}>{code(r)}</View>
                  {r.effective_useful ? (
                    <Text style={styles.badge}>有用反馈</Text>
                  ) : null}
                </View>
                <Text style={styles.body}>{scopeLabel(r.scope)}</Text>
                <Text style={styles.meta}>
                  {localTime(r.contributed_at, r.scope.timezone)} 贡献
                </Text>
                {r.last_success_at ? (
                  <Text style={styles.meta}>
                    最近实测有用 ·{" "}
                    {localTime(r.last_success_at, r.scope.timezone)}
                  </Text>
                ) : null}
                <View style={styles.feedbackRow}>
                  {(["useful", "not_useful"] as const).map((v) => (
                    <Pressable
                      focusable
                      key={v}
                      accessibilityRole="button"
                      accessibilityLabel={v === "useful" ? "有用" : "没用"}
                      accessibilityState={{
                        selected: r.my_feedback === v,
                        disabled: !!p.feedbackBusy,
                        busy: p.feedbackBusy === r.id,
                      }}
                      disabled={!!p.feedbackBusy}
                      onPress={() => void vote(r, v)}
                      style={[
                        styles.feedback,
                        r.my_feedback === v && styles.feedbackSelected,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color:
                            r.my_feedback === v
                              ? tokens.color.brandPrimary
                              : tokens.color.ink,
                        }}
                      >
                        {r.my_feedback === v ? "✓ " : ""}
                        {v === "useful" ? "有用" : "没用"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Pressable
              focusable
              accessibilityRole="button"
              onPress={p.onOther}
              style={styles.linkRow}
            >
              <Text style={styles.meta}>不是这栋公寓？</Text>
              <Icon name="chevron" size={18} color={tokens.color.textMuted} />
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      {large ? (
        <Modal
          visible
          animationType="fade"
          onRequestClose={() => setLargeId(null)}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHead}>
              <IconButton
                name="back"
                label="返回密码记录"
                onPress={() => setLargeId(null)}
              />
              <Text style={styles.title}>进入信息</Text>
              <View style={{ width: 48 }} />
            </View>
            <ScrollView contentContainerStyle={styles.largeContent}>
              <Text style={styles.title}>{p.apartment.name ?? "公寓"}</Text>
              <Text style={styles.body}>
                {p.apartment.address_line1}, {p.apartment.city},{" "}
                {p.apartment.state}
              </Text>
              {large ? (
                <>
                  <Text selectable style={styles.largeCode}>
                    {large.method === "keypad"
                      ? large.value
                      : methodLabel(large)}
                  </Text>
                  {large.method !== "keypad" ? (
                    <Text style={styles.body}>{large.value}</Text>
                  ) : null}
                  <Text style={styles.body}>{scopeLabel(large.scope)}</Text>
                </>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "72%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.surface,
    zIndex: 20,
    paddingBottom: 12,
    shadowColor: "#1B2D44",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 5,
  },
  expanded: { height: "86%", maxHeight: "86%", zIndex: 30 },
  handleArea: { height: 25, alignItems: "center", justifyContent: "center" },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#D9DDE2" },
  inner: { paddingHorizontal: 22, paddingBottom: 8 },
  heading: { flexDirection: "row", alignItems: "flex-start" },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  body: { fontSize: 14, lineHeight: 21, color: tokens.color.textSecondary },
  meta: { fontSize: 14, lineHeight: 22, color: tokens.color.textMuted },
  code: {
    fontSize: 40,
    lineHeight: 52,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontVariant: ["tabular-nums"],
    color: tokens.color.ink,
    paddingTop: 9,
    paddingBottom: 2,
  },
  recordCode: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: 1,
    color: tokens.color.ink,
  },
  record: {
    borderTopWidth: 1,
    borderColor: tokens.color.border,
    paddingTop: 12,
    paddingBottom: 15,
    gap: 4,
  },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    color: tokens.color.success,
    backgroundColor: tokens.color.successSoft,
    borderRadius: 6,
  },
  feedbackRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  feedback: {
    minWidth: 64,
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: 9,
  },
  feedbackSelected: {
    backgroundColor: tokens.color.brandSurface,
    borderColor: tokens.color.brandPrimary,
  },
  state: { paddingVertical: 20, gap: 14 },
  stateTitle: { fontSize: 22, fontWeight: "600", color: tokens.color.ink },
  linkRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  link: { fontSize: 14, color: tokens.color.brandPrimary },
  error: {
    fontSize: 14,
    lineHeight: 22,
    color: tokens.color.danger,
    paddingVertical: 8,
  },
  modal: { flex: 1, backgroundColor: tokens.color.surface },
  modalHead: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  largeContent: {
    flexGrow: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  largeCode: {
    fontSize: 56,
    fontWeight: "700",
    letterSpacing: 2,
    color: tokens.color.ink,
    textAlign: "center",
    paddingVertical: 28,
    fontVariant: ["tabular-nums"],
  },
});
