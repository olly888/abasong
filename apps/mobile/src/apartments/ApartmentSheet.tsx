import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton } from "../auth/AuthControls";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/Primitives";
import {
  anchorOffset,
  contributionMeta,
  localTime,
  methodLabel,
  scopeLabel,
  type Anchor,
} from "./presentation";
import { AddressLine } from "./AddressLine";
import { locality } from "./address-presentation";
import {
  compactCardHeight,
  cardHandleHeight,
  measuredCardHeight,
} from "./card-layout";
import { ApartmentMeta } from "./ApartmentMeta";
import type { NearbyCardCandidate } from "./distance-presentation";
import type { DiscoveryObservation } from "./nearby-policy";
type S = components["schemas"];
export type SheetProps = {
  apartment: S["Apartment"];
  distanceCandidate?: NearbyCardCandidate;
  observation?: DiscoveryObservation | null;
  embedded?: boolean;
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
  collapsedHeight?: number;
  onCompactHeight?: (height: number) => void;
};
export function ApartmentSheet(p: SheetProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    positions = useRef<Record<string, number>>({}),
    offset = useRef(0),
    anchor = useRef<Anchor | null>(null),
    mounted = useRef(true);
  const [bodyHeight, setBodyHeight] = useState(0);
  const baseHeight = compactCardHeight(useWindowDimensions().fontScale);
  const collapsedHeight = Math.max(
    baseHeight,
    p.collapsedHeight ?? 0,
    bodyHeight + cardHandleHeight + 8,
  );
  const canRead = p.status === "ready",
    records = canRead ? p.records : [];
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
      <View
        style={[styles.codeBlock, r.method === "keypad" && styles.keypadBlock]}
      >
        <Text
          accessibilityLabel={
            r.method === "keypad" ? `门禁码 ${r.value}` : methodLabel(r)
          }
          style={[
            big ? styles.code : styles.recordCode,
            r.method === "keypad" && { flex: 1, minWidth: 0 },
          ]}
        >
          {r.method === "keypad" ? r.value : methodLabel(r)}
        </Text>
        {r.method === "keypad" &&
        r.scope.label &&
        !["大门", "门别未注明", "门别未标注"].includes(r.scope.label) ? (
          <Text style={[styles.body, { maxWidth: 88, flexShrink: 1 }]}>
            {r.scope.label}
          </Text>
        ) : null}
        {r.method !== "keypad" ? (
          <Text style={styles.body}>{r.value}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View
      onLayout={(e) => p.onHeight?.(e.nativeEvent.layout.height)}
      style={[
        styles.panel,
        { height: collapsedHeight - (p.embedded ? cardHandleHeight : 0) },
        p.expanded && styles.expanded,
        p.embedded && {
          position: "relative",
          left: undefined,
          right: undefined,
          bottom: undefined,
          maxHeight: undefined,
          borderRadius: 24,
          shadowOpacity: 0,
          elevation: 0,
        },
      ]}
    >
      {!p.embedded ? (
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
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        ref={scroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
      >
        <View
          style={styles.inner}
          onLayout={(e) => {
            // A first-pass zero-width carousel can wrap every code character
            // onto its own line on Android. Never cache that transient height.
            if (p.expanded) return;
            const measured = measuredCardHeight(
              e.nativeEvent.layout.width,
              e.nativeEvent.layout.height,
              baseHeight,
            );
            if (measured === null) return;
            const body = Math.ceil(e.nativeEvent.layout.height);
            setBodyHeight(body);
            p.onCompactHeight?.(measured);
          }}
        >
          <View style={styles.heading}>
            <Pressable
              focusable
              accessibilityRole="button"
              accessibilityHint={`${p.expanded ? "收起" : "展开"}公寓详情`}
              onPress={() => p.onExpand(!p.expanded)}
              style={{
                flex: 1,
                gap: p.expanded ? 4 : 0,
                minHeight: 48,
              }}
            >
              <AddressLine
                line={p.apartment.address_line1}
                expanded={p.expanded}
              />
              {!p.expanded ? (
                <ApartmentMeta
                  city={p.apartment.city}
                  candidate={p.distanceCandidate}
                  observation={p.observation}
                />
              ) : null}
              {p.expanded ? (
                <>
                  <Text style={styles.body}>{locality(p.apartment)}</Text>
                  {p.apartment.name ? (
                    <Text style={styles.body}>{p.apartment.name}</Text>
                  ) : null}
                </>
              ) : null}
            </Pressable>
            {p.expanded ? (
              <>
                <IconButton
                  name="down"
                  label="收起门禁码记录"
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
            <View style={[styles.state, !p.expanded && styles.compactState]}>
              <ActivityIndicator color={tokens.color.brandPrimary} />
              <Text style={styles.meta}>正在读取</Text>
            </View>
          ) : null}
          {p.status === "denied" ? (
            <View style={[styles.state, !p.expanded && styles.compactState]}>
              <Text style={styles.stateTitle}>暂未开通资料查看资格</Text>
            </View>
          ) : null}
          {p.status === "error" ? (
            <View style={[styles.state, !p.expanded && styles.compactState]}>
              <Text accessibilityRole="alert" style={styles.body}>
                暂时无法读取门禁码
              </Text>
              <ActionButton label="重新读取" onPress={p.onRetry} />
            </View>
          ) : null}
          {p.expanded && p.error && p.status !== "error" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {p.error}
            </Text>
          ) : null}
          {canRead && !records.length ? (
            <View style={[styles.state, !p.expanded && styles.compactState]}>
              <Text style={styles.stateTitle}>暂无共享门禁码</Text>
              {!p.expanded ? (
                <ActionButton label="添加门禁码" onPress={p.onAdd} />
              ) : null}
            </View>
          ) : null}
          {canRead && !p.expanded && records[0] ? (
            <>
              {code(records[0], true)}
              <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
                {contributionMeta(records[0])}
              </Text>
              <Pressable
                focusable
                accessibilityRole="button"
                hitSlop={2}
                style={styles.linkRow}
                onPress={() => p.onExpand(true)}
              >
                <Text style={styles.link}>
                  查看 {records.length} 条门禁码记录
                </Text>
                <Icon name="up" size={18} color={tokens.color.brandPrimary} />
              </Pressable>
            </>
          ) : null}
          {p.expanded ? (
            <>
              <View style={{ paddingTop: 18, paddingBottom: 14 }}>
                <ActionButton label="＋ 添加门禁码" onPress={p.onAdd} />
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
                  {r.scope.weekdays?.length || r.scope.start_local ? (
                    <Text style={styles.body}>{scopeLabel(r.scope)}</Text>
                  ) : null}
                  <Text style={styles.meta}>{contributionMeta(r)}</Text>
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
                hitSlop={2}
                style={styles.linkRow}
              >
                <Text style={styles.meta}>不是这栋公寓？</Text>
                <Icon name="chevron" size={18} color={tokens.color.textMuted} />
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    maxHeight: "72%",
    borderRadius: 24,
    backgroundColor: tokens.color.surface,
    zIndex: 20,
    paddingBottom: 8,
    shadowColor: "#1B2D44",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 5,
  },
  expanded: {
    left: 0,
    right: 0,
    bottom: 0,
    height: "86%",
    maxHeight: "86%",
    zIndex: 30,
  },
  handleArea: {
    height: cardHandleHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#D9DDE2" },
  inner: { paddingHorizontal: 16, paddingBottom: 2 },
  heading: { flexDirection: "row", alignItems: "flex-start" },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  body: { fontSize: 14, lineHeight: 21, color: tokens.color.textSecondary },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textMuted },
  codeBlock: { minWidth: 0, alignSelf: "stretch" },
  keypadBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontVariant: ["tabular-nums"],
    color: tokens.color.ink,
    paddingTop: 0,
    paddingBottom: 0,
  },
  recordCode: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
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
  compactState: { paddingVertical: 12, gap: 8 },
  stateTitle: { fontSize: 22, fontWeight: "600", color: tokens.color.ink },
  linkRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 0,
  },
  link: { fontSize: 14, color: tokens.color.brandPrimary },
  error: {
    fontSize: 14,
    lineHeight: 22,
    color: tokens.color.danger,
    paddingVertical: 8,
  },
});
