import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
type C = components["schemas"]["NearbyCandidate"];
export function NearbyCarousel(p: {
  items: C[];
  selectedKey: string;
  onSelect: (c: C) => void;
  onSwipeStart: () => void;
  onHeight: (h: number) => void;
  children: (onHeight: (h: number) => void) => ReactNode;
}) {
  const [width, setWidth] = useState(0),
    [height, setHeight] = useState(250),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    dragging = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = Math.max(
    0,
    p.items.findIndex((c) => c.key === p.selectedKey),
  );
  const multi = p.items.length > 1,
    w = Math.max(0, width - (multi ? 64 : 32)),
    step = w + 12;
  useEffect(() => {
    scroll.current?.scrollTo({ x: index * step, animated: false });
  }, [index, step]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const settle = (x: number) => {
    clearTimeout(timer.current);
    const n = Math.max(0, Math.min(p.items.length - 1, Math.round(x / step)));
    if (!dragging.current && n === index) return;
    dragging.current = false;
    if (p.items[n]) p.onSelect(p.items[n]!);
  };
  const end = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(e.nativeEvent.contentOffset.x);
  return (
    <View
      style={s.panel}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        p.onHeight(e.nativeEvent.layout.height);
      }}
    >
      <ScrollView
        ref={scroll}
        horizontal
        scrollEnabled={multi}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        style={{ height: height + 44 }}
        contentContainerStyle={{
          paddingHorizontal: multi ? 32 : 16,
          paddingVertical: 8,
          gap: 12,
        }}
        onScrollBeginDrag={() => {
          dragging.current = true;
          p.onSwipeStart();
        }}
        onMomentumScrollBegin={() => clearTimeout(timer.current)}
        onMomentumScrollEnd={end}
        onScrollEndDrag={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => settle(x), 200);
        }}
      >
        {p.items.map((c) => (
          <View
            key={c.key}
            style={[s.card, { width: w, minHeight: height + 28 }]}
            accessibilityElementsHidden={c.key !== p.selectedKey}
            importantForAccessibility={
              c.key !== p.selectedKey ? "no-hide-descendants" : "auto"
            }
          >
            <View
              style={s.caption}
              accessible={c.key === p.selectedKey}
              accessibilityRole={multi ? "adjustable" : "text"}
              accessibilityLabel={
                multi
                  ? `附近公寓，第${index + 1}处，共${p.items.length}处`
                  : "附近公寓"
              }
              accessibilityActions={
                multi
                  ? [
                      { name: "increment", label: "下一处公寓" },
                      { name: "decrement", label: "上一处公寓" },
                    ]
                  : undefined
              }
              onAccessibilityAction={(e) => {
                const n =
                  index + (e.nativeEvent.actionName === "increment" ? 1 : -1);
                if (p.items[n]) p.onSelect(p.items[n]!);
              }}
            >
              <Text style={s.meta}>附近公寓</Text>
              {multi ? (
                <Text style={s.meta}>
                  {p.items.indexOf(c) + 1}/{p.items.length}
                </Text>
              ) : null}
            </View>
            {c.key === p.selectedKey ? (
              p.children(setHeight)
            ) : (
              <View style={s.preview}>
                {c.address ? (
                  <AddressLine line={c.address.address_line1} />
                ) : (
                  <Text style={s.title}>公寓 · 地址待核对</Text>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: "transparent",
    zIndex: 20,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E7EBEF",
    shadowColor: "#15253B",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    overflow: "hidden",
  },
  caption: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  meta: { fontSize: 12, color: tokens.color.textSecondary },
  preview: {
    padding: 16,

    minHeight: 180,
  },
  title: { fontSize: 20, color: tokens.color.ink },
});
