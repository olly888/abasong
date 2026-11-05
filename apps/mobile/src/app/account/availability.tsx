import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { dataRequest } from "../../apartments/client";
import { AccountError } from "../../auth/api-client";
import { RequestGate } from "../../requests/RequestUi";
import { AvailabilityEditor } from "../../drivers/AvailabilityEditor";
import {
  availabilityFields,
  availabilityPayload,
} from "../../drivers/availability-fields";
type S = components["schemas"];
export default function Availability() {
  return (
    <RequestGate title="可接活设置">
      <Editor />
    </RequestGate>
  );
}
function Editor() {
  const { session } = useAuth(),
    [form, setForm] = useState(() => availabilityFields(null)),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [version, setVersion] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [status, setStatus] = useState("");
  const scope = useRef(0),
    working = useRef(false);
  const load = useCallback(async () => {
    if (!session) return;
    const g = ++scope.current;
    setBusy(true);
    setError(null);
    try {
      const [page, current] = await Promise.all([
        dataRequest<S["RegionPage"]>(session, "/v1/regions?limit=100"),
        dataRequest<S["Availability"]>(session, "/v1/me/availability").catch(
          (e) => {
            if (e instanceof AccountError && e.status === 404) return null;
            throw e;
          },
        ),
      ]);
      if (g !== scope.current) return;
      setRegions(page.items);
      setVersion(current?.version ?? 0);
      setForm(availabilityFields(current));
      setStatus(
        current?.enabled && Date.parse(current.ends_at) <= Date.now()
          ? "上次时段已结束，请设置本次时间"
          : "",
      );
      setReady(true);
    } catch (e) {
      if (g === scope.current) {
        setReady(false);
        setError(e instanceof Error ? e.message : "状态读取失败，请重试");
      }
    } finally {
      if (g === scope.current) setBusy(false);
    }
  }, [session?.access_token]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        scope.current++;
      };
    }, [load]),
  );
  async function save() {
    if (!session || !ready || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const g = scope.current;
    try {
      const result = await dataRequest<S["Availability"]>(
        session,
        "/v1/me/availability",
        { method: "PUT", body: availabilityPayload(form, version) },
      );
      if (g === scope.current) {
        setVersion(result.version);
        if (router.canGoBack()) router.back();
        else router.replace("/profile");
      }
    } catch (e) {
      if (g === scope.current)
        setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      working.current = false;
      if (g === scope.current) setBusy(false);
    }
  }
  return (
    <AvailabilityEditor
      {...{ form, regions, error, status }}
      busy={busy}
      saveDisabled={!ready}
      onChange={setForm}
      onSave={() => void save()}
      onReload={() => void load()}
    />
  );
}
