import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AddressLine } from "./AddressLine";
import { MapCardCarousel } from "../ui/MapCardCarousel";
import type { ReactNode } from "react";
type Candidate = components["schemas"]["NearbyCandidate"];
export function NearbyCarousel(p: {
  items: Candidate[];
  selectedKey: string;
  onSelect: (candidate: Candidate) => void;
  onSwipeStart: () => void;
  onHeight: (height: number) => void;
  onExpand?: () => void;
  minimumHeight?: number;
  children: () => ReactNode;
}) {
  return (
    <MapCardCarousel
      {...p}
      getKey={(c) => c.key}
      getAccessibilityLabel={(c, i, count) =>
        `${c.address?.address_line1 ?? "公寓地址待核对"}，第${i + 1}处，共${count}处`
      }
      nextLabel="下一处公寓"
      previousLabel="上一处公寓"
      expandLabel="展开公寓卡片"
      renderPreview={(c) => (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {c.address ? (
            <AddressLine line={c.address.address_line1} />
          ) : (
            <Text style={{ fontSize: 20, color: tokens.color.ink }}>
              公寓 · 地址待核对
            </Text>
          )}
        </View>
      )}
    />
  );
}
