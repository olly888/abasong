import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
export function useInboxCount() {
  const { session, phase } = useAuth(),
    [count, setCount] = useState<number | null>(null),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) =>
      setForeground(x === "active"),
    );
    return () => s.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setCount(null);
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
          if (live) setCount(r.unread_messages + r.unread_notifications);
        } catch {
          if (live) setCount(null);
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
  return count;
}
