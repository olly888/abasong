import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { Field, ActionButton, FormError } from "../auth/AuthControls";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { AccountError } from "../auth/api-client";
import { exactQuantity, isV2, type DeliveryRequest } from "./presentation";
import { requestStyles as s, RequestSheet } from "./RequestUi";
export function GapSheet({
  request: r,
  onClose,
  onSaved,
  onRefresh,
}: {
  request: DeliveryRequest;
  onClose: () => void;
  onSaved: (r: DeliveryRequest) => void;
  onRefresh: () => void;
}) {
  const { session } = useAuth();
  const transport: ContributionRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
  return (
    <GapEditor
      request={r}
      transport={transport}
      onClose={onClose}
      onSaved={onSaved}
      onRefresh={onRefresh}
    />
  );
}
export function GapEditor({
  request: r,
  transport,
  onClose,
  onSaved,
  onRefresh,
}: {
  request: DeliveryRequest;
  transport: ContributionRequest;
  onClose: () => void;
  onSaved: (r: DeliveryRequest) => void;
  onRefresh: () => void;
}) {
  const [quantity, setQuantity] = useState(String(r.remaining_parcels ?? 0)),
    [drivers, setDrivers] = useState(String(r.remaining_drivers ?? 0)),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [changed, setChanged] = useState(false),
    lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const n = (v: string) => {
        if (!/^\d+$/.test(v) || Number(v) > 2147483647)
          throw new Error("请填写有效的剩余数量");
        return Number(v);
      };
      const result = await transport<DeliveryRequest>(
        `/v1/requests/${r.id}/gap`,
        {
          method: "PATCH",
          body: {
            expected_version: r.version,
            ...(isV2(r) ? { request_schema_version: 2 } : {}),
            ...(exactQuantity(r) && r.parcel_count !== null
              ? { remaining_parcels: n(quantity) }
              : {}),
            ...(r.drivers_needed !== null
              ? { remaining_drivers: n(drivers) }
              : {}),
          },
        },
      );
      if (!mounted.current) return;
      onSaved(result);
      onClose();
    } catch (e) {
      if (
        mounted.current &&
        e instanceof AccountError &&
        ["VERSION_CONFLICT", "REQUEST_ENDED"].includes(e.code)
      )
        setChanged(true);
      if (mounted.current)
        setError(e instanceof Error ? e.message : "缺口保存失败");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <RequestSheet
      onRequestClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <Text style={s.headline}>更新剩余缺口</Text>
      {exactQuantity(r) && r.parcel_count !== null ? (
        <Field
          label="剩余件数"
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          editable={!busy}
        />
      ) : null}
      {r.drivers_needed !== null ? (
        <Field
          label="还需要几名司机"
          value={drivers}
          onChangeText={setDrivers}
          keyboardType="number-pad"
          editable={!busy}
        />
      ) : null}
      <FormError message={error} />
      {changed ? (
        <ActionButton
          label="查看当前需求"
          onPress={() => {
            onClose();
            onRefresh();
          }}
        />
      ) : (
        <ActionButton
          label="保存缺口"
          busy={busy}
          onPress={() => void save()}
        />
      )}
      <ActionButton label="取消" secondary disabled={busy} onPress={onClose} />
    </RequestSheet>
  );
}
