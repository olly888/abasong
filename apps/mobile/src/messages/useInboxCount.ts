import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
export function useInboxCount() {
  const { session, phase } = useAuth(),
    [result, setResult] = useState<{ token: string; count: number } | null>(
      null,
    ),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) =>
      setForeground(x === "active"),
    );
    return () => s.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setResult(null);
      if (!session || phase !== "ready" || !foreground) return;
      let live = true,
        busy = false;
      const c = new AbortController();
      const load = async () => {
        if (busy) return;
        busy = true;
        try {
          const r = await dataRequest<components["schemas"]["InboxSummary"]>(
            session,
            "/v1/me/inbox-summary",
            { signal: c.signal },
          );
          if (live)
            setResult({
              token: session.access_token,
              count: r.unread_messages + r.unread_notifications,
            });
        } catch {
          if (live) setResult(null);
        } finally {
          busy = false;
        }
      };
      void load();
      const timer = setInterval(() => void load(), 15000);
      return () => {
        live = false;
        c.abort();
        clearInterval(timer);
      };
    }, [session?.access_token, phase, foreground]),
  );
  return foreground &&
    phase === "ready" &&
    result?.token === session?.access_token
    ? (result?.count ?? null)
    : null;
}
