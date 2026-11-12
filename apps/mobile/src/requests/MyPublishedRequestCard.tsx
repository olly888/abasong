import { Text, View } from "react-native";
import { ActionButton } from "../auth/AuthControls";
import { requestStyles as s } from "./RequestUi";
import {
  publishedRequestCounts,
  publishedRequestTimestamp,
  requestTitle,
  statusLabels,
  type DeliverySummary,
} from "./presentation";

export function MyPublishedRequestCard({
  request,
  region,
  onAction,
  onPreview,
}: {
  request: DeliverySummary;
  region?: string;
  onAction: () => void;
  onPreview: () => void;
}) {
  const draft = request.status === "draft";
  const timestamp = publishedRequestTimestamp(request);
  return (
    <View style={[s.card, { padding: 14, gap: 6 }]}>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        <Text style={[s.label, { flexShrink: 1 }]}>
          {requestTitle(request)}
        </Text>
        <Text style={request.status === "open" ? s.status : s.secondary}>
          {statusLabels[request.status]}
        </Text>
      </View>
      <Text style={s.headline}>{region ?? "未填写区域"}</Text>
      <Text style={s.text}>
        {publishedRequestCounts(request).filter(Boolean).join(" · ")}
      </Text>
      {timestamp ? <Text style={s.secondary}>{timestamp}</Text> : null}
      <View style={[s.choices, { alignItems: "center" }]}>
        <ActionButton
          label={draft ? "继续编辑" : "管理需求"}
          variant="text"
          onPress={onAction}
        />
        {draft ? (
          <ActionButton label="预览草稿" variant="text" onPress={onPreview} />
        ) : null}
      </View>
    </View>
  );
}
