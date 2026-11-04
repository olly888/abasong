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
import {
  createCarouselGesture,
  createCarouselAlignment,
} from "./carousel-gesture";
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
  const current = useRef(p);
  current.current = p;
  const frame = useRef({ step: 1 });
  const alignment = useRef(createCarouselAlignment());
  const [width, setWidth] = useState(0),
    scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    gesture = useRef(
      createCarouselGesture((n) => {
        const candidate = current.current.items[n];
        if (candidate) {
          const x = n * frame.current.step;
          alignment.current.alignTo(x);
          scroll.current?.scrollTo({ x, animated: false });
          current.current.onSelect(candidate);
        }
      }),
    );
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
  frame.current.step = step;
  useEffect(() => {
    gesture.current.cancel();
    if (width > 0) {
      alignment.current.alignTo(index * step);
      scroll.current?.scrollTo({ x: index * step, animated: false });
    }
  }, [index, step, width]);
  useEffect(() => () => gesture.current.cancel(), []);
  const settle = (x: number) => {
    gesture.current.finish(x, step, p.items.length, index);
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
          gesture.current.begin();
          p.onSwipeStart();
        }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          if (alignment.current.observe(x) && !gesture.current.isActive()) {
            gesture.current.begin();
            p.onSwipeStart();
            gesture.current.release(x, step, p.items.length, index);
          }
          gesture.current.scroll(x, step, p.items.length, index);
        }}
        onMomentumScrollBegin={() => gesture.current.momentum()}
        onMomentumScrollEnd={end}
        onScrollEndDrag={(e) => {
          gesture.current.release(
            e.nativeEvent.contentOffset.x,
            step,
            p.items.length,
            index,
          );
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
                if (
                  !["increment", "decrement"].includes(e.nativeEvent.actionName)
                )
                  return;
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
