import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@abasong/ui";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/Primitives";
import {
  kindLabels,
  requestPrice,
  requestTime,
  scenarioLabels,
  statusLabels,
} from "../requests/presentation";
import { CirclePhotoGallery } from "./CirclePhotos";
import { circleTopics, type Circle, type CircleRequest } from "./session";

export function CirclePostCard({
  post,
  request,
  onOpen,
  onAuthor,
  onRequest,
  onMore,
}: {
  post: Circle["Post"];
  request: CircleRequest;
  onOpen?: () => void;
  onAuthor: (id: string) => void;
  onRequest: (id: string) => void;
  onMore?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isLong, setLong] = useState(false);
  return (
    <View style={s.post}>
      <View style={s.authorRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`查看${post.author.display_name}的资料`}
          onPress={() => onAuthor(post.author.user_id)}
          style={s.author}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {Array.from(post.author.display_name)[0]}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name}>{post.author.display_name}</Text>
            <Text style={s.meta}>
              {[post.region?.label, requestTime(post.created_at)]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </Pressable>
        {onMore ? (
          <IconButton name="more" label="动态更多操作" onPress={onMore} />
        ) : null}
      </View>
      {post.topic ? (
        <Text style={s.topic}>{circleTopics[post.topic]}</Text>
      ) : null}
      {onOpen ? (
        <View>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onTextLayout={({ nativeEvent }) =>
              setLong(nativeEvent.lines.length > 4)
            }
            style={[s.body, s.measure]}
          >
            {post.body}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="查看动态详情"
            onPress={onOpen}
          >
            <Text style={s.body} numberOfLines={expanded ? undefined : 4}>
              {post.body}
            </Text>
          </Pressable>
          {isLong ? (
            <TextButton
              label={expanded ? "收起" : "展开"}
              onPress={() => setExpanded((v) => !v)}
            />
          ) : null}
        </View>
      ) : (
        <Text style={s.body} selectable>
          {post.body}
        </Text>
      )}
      {post.media?.length ? (
        <CirclePhotoGallery key={post.id} post={post} request={request} />
      ) : null}
      {post.has_request ? (
        <CircleSource request={post.request} onOpen={onRequest} />
      ) : null}
      {onOpen ? (
        <Pressable accessibilityRole="button" onPress={onOpen} style={s.reply}>
          <Icon name="message" size={18} />
          <Text style={s.name}>
            {post.reply_count ? `回复 ${post.reply_count}` : "回复"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TextButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={s.textButton}
    >
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

function CircleSource({
  request: r,
  onOpen,
}: {
  request: Circle["CircleRequestSummary"] | null;
  onOpen: (id: string) => void;
}) {
  if (!r)
    return (
      <View style={s.source}>
        <Text style={s.meta}>关联需求暂不可查看</Text>
      </View>
    );
  const title = r.scenario ? scenarioLabels[r.scenario] : kindLabels[r.kind];
  const time =
    r.handoff_mode === "asap"
      ? `${r.handoff_date ?? ""} 尽快接手`.trim()
      : r.starts_at
        ? requestTime(r.starts_at)
        : null;
  const pieces =
    r.quantity_mode === "unknown"
      ? "件数待确认"
      : r.quantity_mode === "estimate" && r.parcel_count !== null
        ? `约 ${r.parcel_count} 件`
        : r.remaining_parcels !== null
          ? `剩余 ${r.remaining_parcels} 件`
          : null;
  const drivers = r.remaining_drivers ?? r.drivers_needed;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(r.id)}
      style={s.source}
    >
      <View style={s.authorRow}>
        <Text style={s.name}>{title}</Text>
        <Text style={s.meta}>{statusLabels[r.status]}</Text>
      </View>
      <Text style={s.sourceBody}>
        {[r.region_label, requestPrice(r), time].filter(Boolean).join(" · ")}
      </Text>
      {pieces || drivers !== null || r.pickup_region_label ? (
        <Text style={s.meta}>
          {[
            pieces,
            drivers !== null ? `需 ${drivers} 人` : null,
            r.pickup_region_label && `${r.pickup_region_label}取件`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  post: { gap: 9, paddingVertical: 14 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  author: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 48,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "600", color: tokens.color.ink },
  name: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: tokens.color.ink,
  },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textSecondary },
  topic: {
    alignSelf: "flex-start",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    backgroundColor: tokens.color.surfaceMuted,
    color: tokens.color.textSecondary,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  body: { fontSize: 16, lineHeight: 26, color: tokens.color.ink },
  measure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  link: { fontSize: 14, fontWeight: "600", color: tokens.color.brandText },
  textButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  reply: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 8,
    minHeight: 48,
  },
  source: {
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 12,
    backgroundColor: tokens.color.surfaceMuted,
  },
  sourceBody: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.textSecondary,
  },
});
