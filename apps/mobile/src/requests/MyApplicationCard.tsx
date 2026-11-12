import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { ActionButton } from "../auth/AuthControls";
import { requestStyles as s } from "./RequestUi";
import {
  applicationSourceStatus,
  requestTime,
  requestTitle,
} from "./presentation";

type Application = components["schemas"]["Application"];

export function MyApplicationCard({
  item,
  region,
  disabled,
  onContact,
  onRequest,
  onWithdraw,
}: {
  item: Application;
  region?: string;
  disabled: boolean;
  onContact: () => void;
  onRequest: () => void;
  onWithdraw: () => void;
}) {
  const request = item.request_summary;
  const sourceStatus = applicationSourceStatus(item);
  const status =
    item.status === "withdrawn"
      ? "已撤回"
      : item.contacted_at
        ? "已联系"
        : "已报名";
  const context = [region, request?.carrier, request?.route_label]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={s.card}>
      <View style={[s.row, { flexWrap: "wrap", alignItems: "flex-start" }]}>
        <Text style={[s.headline, { flexShrink: 1 }]}>
          {request ? requestTitle(request) : "配送需求"}
        </Text>
        <Text style={s.status}>{status}</Text>
      </View>
      {context ? <Text style={s.secondary}>{context}</Text> : null}
      <Text style={s.text}>
        到场 {requestTime(item.expected_arrival_at)}
        {item.capacity_parcels !== null
          ? ` · 可接 ${item.capacity_parcels} 件`
          : ""}
      </Text>
      {sourceStatus ? <Text style={s.secondary}>{sourceStatus}</Text> : null}
      <ActionButton
        label={request?.status === "open" ? "联系" : "查看会话"}
        secondary
        disabled={disabled}
        onPress={onContact}
      />
      {request ? (
        <ActionButton label="查看当前需求" variant="text" onPress={onRequest} />
      ) : null}
      {item.status === "applied" ? (
        <ActionButton
          label="撤回报名"
          variant="text"
          disabled={disabled}
          onPress={onWithdraw}
        />
      ) : null}
    </View>
  );
}
