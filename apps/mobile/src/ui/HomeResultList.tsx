import { useEffect, useRef, type ReactNode, type ComponentProps } from "react";
import { FlatList, View, type FlatListProps } from "react-native";
import { HomeCoreMeasurement } from "./HomeCoreMeasurement";
import { coreVisibleKeys, type ResultGeometry } from "./home-core-visibility";
import { createHomeScrollIntent } from "./home-scroll-intent";

/** Shared-slot cards, with growth for long text and mode-local reading memory. */
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
  const geometry = useRef(new Map<string, ResultGeometry>());
  const viewport = useRef(0);
  const offset = useRef(initial.current);
  const lastVisible = useRef<string | null>(null);
  const mounted = useRef(true);
  const scrollIntent = useRef(createHomeScrollIntent());
  const contentHeight = useRef(0);
  const alignOffset = (y: number) =>
    scrollIntent.current.align(
      Math.max(0, Math.min(y, contentHeight.current - viewport.current)),
    );
  const reportVisible = () => {
    if (!mounted.current) return;
    const props = latest.current;
    const keys = coreVisibleKeys(
      props.items.map(props.getKey),
      geometry.current,
      offset.current,
      viewport.current,
    );
    const active = new Set(keys);
    visible.current = props.items.filter((item) =>
      active.has(props.getKey(item)),
    );
    const signature = JSON.stringify(keys);
    if (signature !== lastVisible.current) {
      lastVisible.current = signature;
      props.onVisible?.(visible.current);
    }
  };
  const report = useRef(reportVisible);
  report.current = reportVisible;
  // Stable component identity preserves virtualized cells and their native focus.
  type CellProps = ComponentProps<
    NonNullable<FlatListProps<T>["CellRendererComponent"]>
  >;
  const Cell = useRef(function MeasuredCell(props: CellProps) {
    const key = latest.current.getKey(props.item);
    useEffect(
      () => () => {
        geometry.current.delete(key);
      },
      [key],
    );
    return (
      <View
        style={props.style}
        onFocusCapture={props.onFocusCapture}
        onLayout={(event) => {
          props.onLayout?.(event);
          geometry.current.set(key, {
            ...geometry.current.get(key),
            row: event.nativeEvent.layout,
          });
          report.current();
        }}
      >
        {props.children}
      </View>
    );
  }).current;
  const focusTarget = (index: number) => {
    // Keep the address at the top even when large text makes a card taller
    // than the viewport. The list clamps the last row to its available offset.
    const item = latest.current.items[index];
    const row = item && geometry.current.get(latest.current.getKey(item))?.row;
    if (row) alignOffset(row.y);
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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (seekTimer.current) clearTimeout(seekTimer.current);
      latest.current.onVisible?.([]);
    };
  }, []);
  useEffect(() => {
    const keys = new Set(p.items.map(p.getKey));
    for (const key of geometry.current.keys())
      if (!keys.has(key)) geometry.current.delete(key);
    report.current();
  }, [p.items]);
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
  return (
    <FlatList
      ref={list}
      data={p.items}
      keyExtractor={p.getKey}
      CellRendererComponent={Cell}
      renderItem={({ item }) => (
        <HomeCoreMeasurement.Provider
          value={(core) => {
            const key = latest.current.getKey(item);
            geometry.current.set(key, { ...geometry.current.get(key), core });
            report.current();
          }}
        >
          {p.renderItem(item)}
        </HomeCoreMeasurement.Provider>
      )}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 20,
        gap: 12,
      }}
      ListHeaderComponent={p.header ? <View>{p.header}</View> : undefined}
      ListFooterComponent={p.footer ? <View>{p.footer}</View> : undefined}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={4}
      windowSize={5}
      onLayout={(event) => {
        viewport.current = event.nativeEvent.layout.height;
        report.current();
      }}
      onContentSizeChange={(_, height) => {
        contentHeight.current = height;
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
        alignOffset(initial.current);
        list.current?.scrollToOffset({
          offset: initial.current,
          animated: false,
        });
      }}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        if (seekAttempts.current++ >= 2) return;
        alignOffset(index * averageItemLength);
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
        scrollIntent.current.begin();
        if (seekTimer.current) clearTimeout(seekTimer.current);
        anchoredKey.current = null;
        moved.current = true;
        p.onInteract?.();
      }}
      onScroll={(e) => {
        if (scrollIntent.current.observe(e.nativeEvent.contentOffset.y)) {
          if (seekTimer.current) clearTimeout(seekTimer.current);
          anchoredKey.current = null;
          moved.current = true;
          latest.current.onInteract?.();
        }
        p.memory.scroll = offset.current = e.nativeEvent.contentOffset.y;
        viewport.current = e.nativeEvent.layoutMeasurement.height;
        report.current();
        if (moved.current) settle();
      }}
      scrollEventThrottle={32}
      onScrollEndDrag={settle}
      onMomentumScrollEnd={settle}
    />
  );
}
