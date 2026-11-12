import { Text } from "react-native";
import { ActionButton } from "../auth/AuthControls";
import {
  hasEditableGap,
  statusLabels,
  type DeliveryRequest,
} from "./presentation";
import { RequestSheet, requestStyles as s } from "./RequestUi";

export function RequestManagement({
  request,
  onClose,
  onEdit,
  onCopy,
  onGap,
  onFound,
  onEnd,
  onReopen,
  onApplications,
}: {
  request: DeliveryRequest;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onGap: () => void;
  onFound: () => void;
  onEnd: () => void;
  onReopen: () => void;
  onApplications: () => void;
}) {
  const open = request.status === "open";
  const delivery = !["vehicle_help", "other_help"].includes(request.kind);
  return (
    <RequestSheet onRequestClose={onClose}>
      <Text accessibilityRole="header" style={s.headline}>
        管理需求
      </Text>
      <Text style={s.secondary}>{statusLabels[request.status]}</Text>
      {open && delivery && hasEditableGap(request) ? (
        <ActionButton label="更新剩余缺口" secondary onPress={onGap} />
      ) : null}
      <ActionButton label="查看报名司机" secondary onPress={onApplications} />
      <ActionButton
        label={open ? "编辑需求" : "更新日期与条件"}
        secondary
        onPress={onEdit}
      />
      {open ? (
        <>
          <ActionButton label="已找到司机" secondary onPress={onFound} />
          <ActionButton label="关闭需求" secondary onPress={onEnd} />
        </>
      ) : (
        <ActionButton label="重新开放" secondary onPress={onReopen} />
      )}
      <ActionButton label="复制为新需求" secondary onPress={onCopy} />
      <ActionButton label="取消" variant="text" onPress={onClose} />
    </RequestSheet>
  );
}
