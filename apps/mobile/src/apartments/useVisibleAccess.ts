import { useEffect, useRef, useState } from "react";
import type { components } from "@abasong/contracts";
import {
  createVisibleAccessReader,
  type AccessRowState,
} from "./visible-access-reader";
type S = components["schemas"];
export function useVisibleAccess(p: {
  scope: string;
  enabled: boolean;
  canRead: boolean;
  read: (id: string, signal: AbortSignal) => Promise<S["AccessList"]>;
  expandedId?: string;
}) {
  const latest = useRef(p);
  latest.current = p;
  const [ids, setIds] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    rows: ReadonlyMap<string, AccessRowState>;
  }>({ scope: p.scope, rows: new Map() });
  const reader = useRef<ReturnType<typeof createVisibleAccessReader> | null>(
    null,
  );
  useEffect(() => {
    const scope = p.scope;
    const r = createVisibleAccessReader(
      (id, signal) => latest.current.read(id, signal),
      (rows) => setSnapshot({ scope, rows }),
    );
    reader.current = r;
    return () => {
      r.dispose();
      reader.current = null;
    };
  }, [p.scope]);
  const signature = [
    ...new Set(p.expandedId ? [p.expandedId, ...ids] : ids),
  ].join("|");
  useEffect(() => {
    reader.current?.update(
      p.enabled ? signature.split("|").filter(Boolean) : [],
      p.canRead,
    );
  }, [p.scope, p.enabled, p.canRead, signature]);
  return {
    rows:
      p.enabled && snapshot.scope === p.scope
        ? snapshot.rows
        : new Map<string, AccessRowState>(),
    visible: (next: string[]) =>
      setIds((old) => (old.join("|") === next.join("|") ? old : next)),
    retry: (id: string) => reader.current?.retry(id),
    refresh: (id: string) => reader.current?.refresh(id),
    fail: (id: string, error: unknown) => reader.current?.fail(id, error),
  };
}
