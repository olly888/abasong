import { useEffect, useRef, type ReactNode } from "react";
import { FlatList, View } from "react-native";

/** Natural-height cards, with a mode-local offset and settled focus. */
export function HomeResultList<T>(p: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  selectedKey?: string | null;
  focusRevision?: number;
  memory: { scroll?: number };
  onInteract?: () => void;
  onFocus?: (item: T) => void;
  onVisible?: (items: T[]) => void;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const list = useRef<FlatList<T>>(null);
  const latest = useRef(p);
  latest.current = p;
  const visible = useRef<T[]>([]);
  const moved = useRef(false);
  const initial = useRef(p.memory.scroll ?? 0);
  const restored = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekAttempts = useRef(0);
  const appliedRevision = useRef<number | undefined>(undefined);
  const anchoredKey = useRef<string | null>(null);
  const viewability = useRef({ itemVisiblePercentThreshold: 15 }).current;
  const focusTarget = (index: number) => {
    // Keep the address at the top even when large text makes a card taller
    // than the viewport. The list clamps the last row to its available offset.
    list.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
  };
  const settle = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (moved.current && visible.current[0])
        latest.current.onFocus?.(visible.current[0]);
      moved.current = false;
    }, 180);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (seekTimer.current) clearTimeout(seekTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!p.focusRevision || appliedRevision.current === p.focusRevision) return;
    const index = p.items.findIndex((r) => p.getKey(r) === p.selectedKey);
    if (index >= 0) {
      appliedRevision.current = p.focusRevision;
      anchoredKey.current = p.selectedKey ?? null;
      seekAttempts.current = 0;
      moved.current = false;
      // An animated jump can finish after an async size correction and restore
      // its stale offset. Explicit return intents use an immediate camera/list pair.
      focusTarget(index);
    }
  }, [p.focusRevision, p.selectedKey, p.items]);
  const onVisible = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: { isViewable: boolean; item: T }[];
    }) => {
      visible.current = viewableItems
        .filter((v) => v.isViewable)
        .map((v) => v.item);
      latest.current.onVisible?.(visible.current);
    },
  ).current;
  return (
    <FlatList
      ref={list}
      data={p.items}
      keyExtractor={p.getKey}
      renderItem={({ item }) => <View>{p.renderItem(item)}</View>}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 20,
        gap: 12,
      }}
      ListHeaderComponent={p.header ? <View>{p.header}</View> : undefined}
      ListFooterComponent={p.footer ? <View>{p.footer}</View> : undefined}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={4}
      windowSize={5}
      onViewableItemsChanged={onVisible}
      viewabilityConfig={viewability}
      onContentSizeChange={() => {
        // Loading/empty/code rows have different heights. Keep an explicit
        // return/map-selection target in view after those heights settle.
        // A user's drag cancels this anchor so later reads never steal it back.
        const anchor = anchoredKey.current;
        if (anchor && anchor === latest.current.selectedKey) {
          if (seekTimer.current) clearTimeout(seekTimer.current);
          const revision = latest.current.focusRevision;
          seekTimer.current = setTimeout(() => {
            if (
              anchoredKey.current !== anchor ||
              latest.current.selectedKey !== anchor ||
              latest.current.focusRevision !== revision
            )
              return;
            const index = latest.current.items.findIndex(
              (item) => latest.current.getKey(item) === anchor,
            );
            if (index >= 0) focusTarget(index);
          }, 50);
        }
        if (restored.current || !p.items.length) return;
        restored.current = true;
        // A return-to-address intent must not be overwritten by old offsets.
        if (p.focusRevision) return;
        list.current?.scrollToOffset({
          offset: initial.current,
          animated: false,
        });
      }}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        if (seekAttempts.current++ >= 2) return;
        list.current?.scrollToOffset({
          offset: index * averageItemLength,
          animated: false,
        });
        if (seekTimer.current) clearTimeout(seekTimer.current);
        // Let virtualization measure the requested region before exact alignment.
        const revision = latest.current.focusRevision;
        seekTimer.current = setTimeout(() => {
          if (latest.current.focusRevision !== revision) return;
          const target = latest.current.items.findIndex(
            (item) =>
              latest.current.getKey(item) === latest.current.selectedKey,
          );
          if (target >= 0) focusTarget(target);
        }, 100);
      }}
      onScrollBeginDrag={() => {
        if (seekTimer.current) clearTimeout(seekTimer.current);
        anchoredKey.current = null;
        moved.current = true;
        p.onInteract?.();
      }}
      onScroll={(e) => {
        p.memory.scroll = e.nativeEvent.contentOffset.y;
        if (moved.current) settle();
      }}
      scrollEventThrottle={32}
      onScrollEndDrag={settle}
      onMomentumScrollEnd={settle}
    />
  );
}
