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
  Pressable,
  PanResponder,
  useWindowDimensions,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
import { compactCardHeight, cardHandleHeight } from "./card-layout";
type C = components["schemas"]["NearbyCandidate"];
export function NearbyCarousel(p: {
  items: C[];
  selectedKey: string;
  onSelect: (c: C) => void;
  onSwipeStart: () => void;
  onHeight: (h: number) => void;
  onExpand?: () => void;
  children: () => ReactNode;
}) {
  const [width, setWidth] = useState(0),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    dragging = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const height = compactCardHeight(useWindowDimensions().fontScale);
  const expand = useRef(p.onExpand);
  expand.current = p.onExpand;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24) expand.current?.();
      },
    }),
  ).current;
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
        style={{ height: height + 16 }}
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
            style={[s.card, { width: w, height }]}
            accessibilityElementsHidden={c.key !== p.selectedKey}
            importantForAccessibility={
              c.key !== p.selectedKey ? "no-hide-descendants" : "auto"
            }
          >
            <View
              {...pan.panHandlers}
              style={s.handleArea}
              onAccessibilityTap={
                c.key === p.selectedKey ? p.onExpand : undefined
              }
              accessible={c.key === p.selectedKey}
              accessibilityRole={multi ? "adjustable" : "button"}
              accessibilityLabel={
                multi
                  ? `${c.address?.address_line1 ?? "公寓地址待核对"}，第${index + 1}处，共${p.items.length}处`
                  : "展开公寓卡片"
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
              <Pressable
                accessible={false}
                style={s.handleArea}
                onPress={c.key === p.selectedKey ? p.onExpand : undefined}
              >
                <View style={s.handle} />
              </Pressable>
            </View>
            {c.key === p.selectedKey ? (
              p.children()
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
    bottom: 4,
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
  handleArea: {
    height: cardHandleHeight,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#D9DDE2" },
  preview: {
    paddingHorizontal: 22,
    paddingTop: 4,
  },
  title: { fontSize: 20, color: tokens.color.ink },
});
