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
  Pressable,
  PanResponder,
  useWindowDimensions,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { MapCardFrame } from "./MapCardFrame";
import { compactCardHeight, cardHandleHeight } from "./map-card-layout";
import {
  createCarouselGesture,
  createCarouselAlignment,
} from "./map-card-gesture";
export function MapCardCarousel<T>(p: {
  items: T[];
  getKey: (item: T) => string;
  getAccessibilityLabel: (item: T, index: number, count: number) => string;
  renderPreview: (item: T) => ReactNode;
  nextLabel: string;
  previousLabel: string;
  expandLabel: string;
  selectedKey: string;
  onSelect: (c: T) => void;
  onSwipeStart: () => void;
  onHeight: (h: number) => void;
  onExpand?: () => void;
  minimumHeight?: number;
  children: () => ReactNode;
}) {
  const current = useRef(p);
  current.current = p;
  const frame = useRef({ step: 1 });
  const alignmentFrame = useRef<number | undefined>(undefined);
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
  const height = Math.max(
    compactCardHeight(useWindowDimensions().fontScale),
    p.minimumHeight ?? 0,
  );
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
    p.items.findIndex((c) => p.getKey(c) === p.selectedKey),
  );
  const multi = p.items.length > 1,
    w = Math.max(0, width - (multi ? 64 : 32)),
    step = w + 12;
  frame.current.step = step;
  const align = () => {
    gesture.current.cancel();
    if (alignmentFrame.current !== undefined)
      cancelAnimationFrame(alignmentFrame.current);
    if (width > 0) {
      alignment.current.alignTo(index * step);
      alignmentFrame.current = requestAnimationFrame(() => {
        alignmentFrame.current = undefined;
        scroll.current?.scrollTo({ x: index * step, animated: false });
      });
    }
  };
  useEffect(() => {
    align();
  }, [index, step, width]);
  useEffect(
    () => () => {
      gesture.current.cancel();
      if (alignmentFrame.current !== undefined)
        cancelAnimationFrame(alignmentFrame.current);
    },
    [],
  );
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
        contentOffset={{ x: index * step, y: 0 }}
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
        onContentSizeChange={() => {
          // Android may clamp the first scrollTo to zero before its children
          // are laid out. Reapply selection once native content is measurable.
          if (!gesture.current.isActive()) align();
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
        {width > 0 &&
          p.items.map((c) => (
            <MapCardFrame
              key={p.getKey(c)}
              style={{ width: w, height }}
              accessibilityElementsHidden={p.getKey(c) !== p.selectedKey}
              importantForAccessibility={
                p.getKey(c) !== p.selectedKey ? "no-hide-descendants" : "auto"
              }
            >
              <View
                {...pan.panHandlers}
                style={s.handleArea}
                onAccessibilityTap={
                  p.getKey(c) === p.selectedKey ? p.onExpand : undefined
                }
                accessible={p.getKey(c) === p.selectedKey}
                accessibilityRole={multi ? "adjustable" : "button"}
                accessibilityLabel={
                  multi
                    ? p.getAccessibilityLabel(c, index, p.items.length)
                    : p.expandLabel
                }
                accessibilityActions={
                  multi
                    ? [
                        { name: "increment", label: p.nextLabel },
                        { name: "decrement", label: p.previousLabel },
                      ]
                    : undefined
                }
                onAccessibilityAction={(e) => {
                  if (
                    !["increment", "decrement"].includes(
                      e.nativeEvent.actionName,
                    )
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
                  onPress={
                    p.getKey(c) === p.selectedKey ? p.onExpand : undefined
                  }
                >
                  <View style={s.handle} />
                </Pressable>
              </View>
              {p.getKey(c) === p.selectedKey
                ? p.children()
                : p.renderPreview(c)}
            </MapCardFrame>
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
  handleArea: {
    height: cardHandleHeight,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#D9DDE2" },
});
