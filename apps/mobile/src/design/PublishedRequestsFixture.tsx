import { useState } from "react";
import { Text } from "react-native";
import type { components } from "@abasong/contracts";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { AuthPage } from "../auth/AuthControls";
import { GapEditor } from "../requests/GapSheet";
import { MyPublishedRequestCard } from "../requests/MyPublishedRequestCard";
import { RequestManagement } from "../requests/RequestManagement";
import { deliveryFixture } from "../requests/delivery-fixtures";
import type { DeliveryRequest } from "../requests/presentation";

const time = "2026-11-11T23:00:00Z";
const draft = deliveryFixture("delivery_handoff");
const ended = ["found", "closed", "expired"] as const;

export function PublishedRequestsFixture() {
  const [request, setRequest] = useState<
    components["schemas"]["RequestDetailV2"] & { updated_at: string }
  >({
    ...deliveryFixture(),
    status: "open",
    quantity_mode: "exact",
    parcel_count: 40,
    remaining_parcels: 25,
    remaining_drivers: 1,
    updated_at: time,
  });
  const [view, setView] = useState<"edit" | "preview" | "applications" | null>(
    null,
  );
  const [managing, setManaging] = useState<DeliveryRequest | null>(null);
  const [gap, setGap] = useState(false);
  const [intent, setIntent] = useState("");
  const transport: ContributionRequest = async <T,>(
    path: string,
    options?: { body?: unknown },
  ) => {
    if (path === `/v1/requests/${request.id}/gap`) {
      const fields = options?.body as Pick<
        typeof request,
        "remaining_parcels" | "remaining_drivers"
      >;
      return { ...request, ...fields, version: request.version + 1 } as T;
    }
    throw new Error("TEST 仅提供缺口保存");
  };
  if (view)
    return (
      <AuthPage
        compact
        title={
          view === "edit"
            ? "TEST · 继续编辑"
            : view === "preview"
              ? "TEST · 预览草稿"
              : "TEST · 报名司机"
        }
        onBack={() => setView(null)}
      >
        <Text>仅本机合成资料</Text>
      </AuthPage>
    );
  return (
    <AuthPage compact title="TEST · 我的发布">
      {intent ? <Text>{intent}</Text> : null}
      <MyPublishedRequestCard
        request={{ ...draft, updated_at: time }}
        region="TEST Glendale"
        onAction={() => setView("edit")}
        onPreview={() => setView("preview")}
      />
      <MyPublishedRequestCard
        request={request}
        region="TEST Pasadena"
        onAction={() => setManaging(request)}
        onPreview={() => {}}
      />
      {ended.map((status) => {
        const item = { ...request, id: status, status };
        return (
          <MyPublishedRequestCard
            key={status}
            request={item}
            region="TEST West Covina"
            onAction={() => setManaging(item)}
            onPreview={() => {}}
          />
        );
      })}
      {gap ? (
        <GapEditor
          request={request}
          transport={transport}
          onClose={() => setGap(false)}
          onRefresh={() => {}}
          onSaved={(value) =>
            setRequest({
              ...request,
              remaining_parcels: value.remaining_parcels,
              remaining_drivers: value.remaining_drivers,
              version: value.version,
            })
          }
        />
      ) : null}
      {managing ? (
        <RequestManagement
          request={managing}
          onClose={() => setManaging(null)}
          onEdit={() => {
            setManaging(null);
            setView("edit");
          }}
          onCopy={() => {
            setManaging(null);
            setIntent("TEST · 复制为新需求");
          }}
          onGap={() => {
            setManaging(null);
            setGap(true);
          }}
          onFound={() => {
            setManaging(null);
            setIntent("TEST · 已找到确认入口");
          }}
          onEnd={() => {
            setManaging(null);
            setIntent("TEST · 关闭确认入口");
          }}
          onReopen={() => {
            setManaging(null);
            setIntent("TEST · 重新开放确认入口");
          }}
          onApplications={() => {
            setManaging(null);
            setView("applications");
          }}
        />
      ) : null}
    </AuthPage>
  );
}
