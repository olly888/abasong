import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { tokens } from "@abasong/ui";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionButton, FormError } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";
import {
  teamError,
  type TeamContact,
  type TeamRequest,
  type TeamSummary,
} from "./team-client";

export function RelatedTeam({
  path,
  request,
}: {
  path: string;
  request: TeamRequest;
}) {
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setTeam(null);
    setError(false);
    try {
      const result = await request<TeamSummary>(path, { signal: c.signal });
      if (!c.signal.aborted) setTeam(result);
    } catch (e) {
      if (!c.signal.aborted && !teamError(e, "NOT_FOUND")) setError(true);
    }
  }, [path, request]);
  const close = useCallback(() => setOpen(false), []);
  useFocusEffect(
    useCallback(() => {
      void load();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
        else {
          controller.current?.abort();
          close();
          setTeam(null);
        }
      });
      return () => {
        controller.current?.abort();
        sub.remove();
        close();
        setTeam(null);
      };
    }, [close, load]),
  );
  if (!team)
    return error ? (
      <ActionButton
        label="重新读取团队资料"
        variant="text"
        onPress={() => void load()}
      />
    ) : null;
  return (
    <View
      style={{
        padding: 16,
        gap: 10,
        borderRadius: 16,
        backgroundColor: tokens.color.surfaceMuted,
      }}
    >
      <Text style={typeStyles.secondary}>当前团队资料</Text>
      <Text style={typeStyles.title}>{team.name}</Text>
      <Text style={typeStyles.body}>联系人 · {team.contact_display_name}</Text>
      {team.carriers.length ? (
        <Text style={typeStyles.secondary}>
          合作快递 · {team.carriers.join("、")}
        </Text>
      ) : null}
      {team.regions.length ? (
        <Text style={typeStyles.secondary}>
          主要配送区域 · {team.regions.map((r) => r.label).join(" / ")}
        </Text>
      ) : null}
      {team.contact_available ? (
        <ActionButton
          label="查看业务联系方式"
          variant="text"
          onPress={() => setOpen(true)}
        />
      ) : null}
      {open && team.contact_available ? (
        <TeamContactSheet
          key={team.id}
          path={path}
          teamId={team.id}
          request={request}
          onClose={close}
        />
      ) : null}
    </View>
  );
}

function TeamContactSheet({
  path,
  teamId,
  request,
  onClose,
}: {
  path: string;
  teamId: string;
  request: TeamRequest;
  onClose: () => void;
}) {
  const [value, setValue] = useState<TeamContact["business_contact"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const read = useCallback(
    async (copy?: "phone" | "wechat") => {
      if (current.current) {
        if (!copy) return;
        current.current.abort();
      }
      const c = new AbortController();
      current.current = c;
      setError(null);
      if (copy) setCopied(null);
      try {
        const response = await request<TeamContact>(path + "/contact", {
          signal: c.signal,
        });
        if (c.signal.aborted) return;
        if (response.team_id !== teamId) throw new Error();
        setValue(response.business_contact);
        clearTimeout(expiry.current);
        expiry.current = setTimeout(() => {
          setValue(null);
          setCopied(null);
          setError("业务联系方式暂不可见");
        }, 12000);
        if (copy && response.business_contact[copy]) {
          const ok = await Clipboard.setStringAsync(
            response.business_contact[copy],
            {
              android: { isSensitive: true },
            },
          );
          if (!c.signal.aborted) {
            if (ok) setCopied("已复制");
            else setError("复制失败，请重试");
          }
        }
      } catch {
        if (!c.signal.aborted) {
          setValue(null);
          setCopied(null);
          setError("业务联系方式暂不可见");
        }
      } finally {
        if (current.current === c) current.current = null;
      }
    },
    [path, request, teamId],
  );
  useEffect(() => {
    void read();
    const timer = setInterval(() => void read(), 8000);
    return () => {
      clearInterval(timer);
      clearTimeout(expiry.current);
      current.current?.abort();
      current.current = null;
    };
  }, [read]);
  return (
    <BottomSheet onRequestClose={onClose}>
      <Text style={typeStyles.title}>业务联系方式</Text>
      <FormError message={error} />
      {!value && !error ? (
        <Text style={typeStyles.secondary}>正在读取…</Text>
      ) : null}
      {value
        ? (
            [
              ["phone", "业务电话"],
              ["wechat", "业务微信"],
            ] as const
          )
            .filter(([key]) => !!value[key])
            .map(([key, label]) => (
              <View key={key} style={{ gap: 8 }}>
                <Text style={typeStyles.secondary}>{label}</Text>
                <Text style={typeStyles.body}>{value[key]}</Text>
                <ActionButton
                  label={`复制${label}`}
                  secondary
                  onPress={() => void read(key)}
                />
              </View>
            ))
        : null}
      {copied ? (
        <Text accessibilityLiveRegion="polite" style={typeStyles.secondary}>
          {copied}
        </Text>
      ) : null}
      <ActionButton label="关闭" variant="text" onPress={onClose} />
    </BottomSheet>
  );
}
