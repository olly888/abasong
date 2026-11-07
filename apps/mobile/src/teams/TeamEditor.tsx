import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { usePreventRemove } from "expo-router";
import { randomUUID } from "expo-crypto";
import { tokens } from "@abasong/ui";
import type { components } from "@abasong/contracts";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";
import { typeStyles } from "../ui/foundation";
import {
  ownTeam,
  teamError,
  teamFields,
  teamInput,
  type OwnTeam,
  type TeamInput,
  type TeamRequest,
} from "./team-client";

const carriers = ["GOFO", "SwiftX", "SpeedX", "UniUni"];
type Region = components["schemas"]["Region"];

export function TeamEditor({
  request,
  contactName,
  onBack,
  onSaved,
  onProfile,
  testControls,
}: {
  request: TeamRequest;
  contactName: string;
  onBack: () => void;
  onSaved: (team: OwnTeam) => void;
  onProfile?: () => void;
  testControls?: ReactNode;
}) {
  const [form, setForm] = useState<TeamInput | null>(null);
  const [existing, setExisting] = useState(false);
  const [original, setOriginal] = useState<TeamInput | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionError, setRegionError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const transport = useRef(request);
  transport.current = request;
  const controller = useRef<AbortController | null>(null);
  const regionController = useRef<AbortController | null>(null);
  const intent = useRef<{ body: string; key: string } | null>(null);
  const pending = useRef(false);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(original);
  const disabled = loading || busy || conflict;
  const loadRegions = useCallback(async () => {
    regionController.current?.abort();
    const c = new AbortController();
    regionController.current = c;
    try {
      const page = await transport.current<{ items: Region[] }>(
        "/v1/regions?limit=100",
        { signal: c.signal },
      );
      if (!c.signal.aborted) {
        setRegions(page.items);
        setRegionError(false);
      }
    } catch {
      if (!c.signal.aborted) setRegionError(true);
    }
  }, []);
  const load = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setError(null);
    setLoading(true);
    try {
      const current = await ownTeam<OwnTeam>(transport.current, c.signal);
      if (c.signal.aborted) return;
      const fields = teamFields(current);
      setExisting(!!current);
      setOriginal(fields);
      setForm(fields);
      setConflict(false);
      intent.current = null;
    } catch {
      if (!c.signal.aborted) setError("团队资料暂时无法读取");
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    void loadRegions();
    return () => {
      controller.current?.abort();
      regionController.current?.abort();
    };
  }, [load, loadRegions]);

  const leave = () => {
    setLeaving(true);
    disablePrevention();
    onBack();
  };
  const confirmLeave = () =>
    Alert.alert("离开团队资料？", "本次修改尚未保存。", [
      { text: "继续编辑", style: "cancel" },
      { text: "放弃修改", style: "destructive", onPress: leave },
    ]);
  const disablePrevention = usePreventRemove(
    !leaving && (dirty || busy),
    () => {
      if (!pending.current) confirmLeave();
    },
  );
  async function save() {
    if (!form || disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    const c = new AbortController();
    controller.current?.abort();
    controller.current = c;
    try {
      const body = teamInput(form);
      const signature = JSON.stringify(body);
      if (intent.current?.body !== signature)
        intent.current = { body: signature, key: randomUUID() };
      const result = await transport.current<OwnTeam>("/v1/me/organization", {
        method: "PUT",
        body,
        key: intent.current.key,
        signal: c.signal,
      });
      if (!c.signal.aborted) {
        setLeaving(true);
        disablePrevention();
        onSaved(result);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        const changed = teamError(e, "VERSION_CONFLICT");
        setConflict(changed);
        setError(
          changed
            ? "团队资料已更新，请读取最新资料后再修改"
            : e instanceof Error
              ? e.message
              : "保存结果未确认，请重试",
        );
      }
    } finally {
      pending.current = false;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  const change = (patch: Partial<TeamInput>) => {
    setForm((f) => f && { ...f, ...patch });
    setError(null);
  };
  const pill = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: selected
          ? tokens.color.brandPrimary
          : tokens.color.controlBorder,
        backgroundColor: selected
          ? tokens.color.brandSurface
          : tokens.color.surface,
      }}
    >
      <Text
        style={[
          typeStyles.body,
          { color: selected ? tokens.color.brandPrimary : tokens.color.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <PageFrame
      compact
      title="团队资料（DSP）"
      onBack={() => {
        if (!pending.current) {
          if (dirty) confirmLeave();
          else leave();
        }
      }}
      footer={
        <>
          <FormError message={error} />
          {conflict ? (
            <ActionButton
              label="读取最新资料"
              disabled={loading}
              onPress={() =>
                Alert.alert("读取最新资料？", "会替换本次未保存的填写。", [
                  { text: "继续编辑", style: "cancel" },
                  { text: "读取并替换", onPress: () => void load() },
                ])
              }
            />
          ) : (
            <ActionButton
              label="保存团队资料"
              disabled={!form || loading || !dirty}
              busy={busy}
              onPress={() => void save()}
            />
          )}
        </>
      }
    >
      {testControls}
      {loading ? (
        <Text style={typeStyles.secondary}>正在读取团队资料…</Text>
      ) : !form ? (
        <ActionButton label="重新读取" secondary onPress={() => void load()} />
      ) : (
        <>
          <Field
            label="团队名称"
            value={form.name}
            maxLength={120}
            editable={!disabled}
            onChangeText={(name) => change({ name })}
          />
          <View style={{ gap: 8 }}>
            <Text style={typeStyles.label}>联系人 · {contactName}</Text>
            {onProfile ? (
              <ActionButton
                label="编辑个人资料"
                variant="text"
                disabled={disabled}
                onPress={onProfile}
              />
            ) : null}
          </View>
          <View style={{ gap: 12 }}>
            <Text style={typeStyles.title}>合作快递公司</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {carriers.map((carrier) =>
                pill(carrier, form.carriers.includes(carrier), () => {
                  if (form.carriers.includes(carrier))
                    change({
                      carriers: form.carriers.filter(
                        (value) => value !== carrier,
                      ),
                    });
                  else if (form.carriers.length < 8)
                    change({ carriers: [...form.carriers, carrier] });
                  else setError("最多选择8家合作快递公司");
                }),
              )}
            </View>
            {form.carriers.map((carrier, i) =>
              !carriers.includes(carrier) ? (
                <View key={i} style={{ gap: 8 }}>
                  <Field
                    label="其他合作快递"
                    value={carrier}
                    editable={!disabled}
                    maxLength={80}
                    onChangeText={(value) =>
                      change({
                        carriers: form.carriers.map((x, j) =>
                          i === j ? value : x,
                        ),
                      })
                    }
                  />
                  <ActionButton
                    label="移除此公司"
                    variant="text"
                    disabled={disabled}
                    onPress={() =>
                      change({
                        carriers: form.carriers.filter((_, j) => i !== j),
                      })
                    }
                  />
                </View>
              ) : null,
            )}
            <ActionButton
              label="添加其他合作快递"
              variant="text"
              disabled={disabled || form.carriers.length >= 8}
              onPress={() => change({ carriers: [...form.carriers, ""] })}
            />
          </View>
          <View style={{ gap: 12 }}>
            <Text style={typeStyles.title}>主要配送区域（最多5个）</Text>
            {regionError ? (
              <ActionButton
                label="重新读取区域"
                secondary
                onPress={() => void loadRegions()}
              />
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {regions.map((region) =>
                pill(region.label, form.region_ids.includes(region.id), () => {
                  if (form.region_ids.includes(region.id))
                    change({
                      region_ids: form.region_ids.filter(
                        (id) => id !== region.id,
                      ),
                    });
                  else if (form.region_ids.length < 5)
                    change({ region_ids: [...form.region_ids, region.id] });
                  else setError("最多选择5个主要配送区域");
                }),
              )}
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <Text style={typeStyles.title}>业务联系方式（选填）</Text>
            <Field
              label="业务电话"
              keyboardType="phone-pad"
              autoComplete="off"
              maxLength={40}
              value={form.business_contact.phone}
              editable={!disabled}
              onChangeText={(phone) =>
                change({
                  business_contact: { ...form.business_contact, phone },
                })
              }
            />
            <Field
              label="业务微信"
              autoCapitalize="none"
              autoComplete="off"
              maxLength={80}
              value={form.business_contact.wechat}
              editable={!disabled}
              onChangeText={(wechat) =>
                change({
                  business_contact: { ...form.business_contact, wechat },
                })
              }
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 48,
              }}
            >
              <Text style={[typeStyles.body, { flex: 1 }]}>
                向有权查看详情的登录用户展示
              </Text>
              <Switch
                accessibilityLabel="分享业务联系方式"
                trackColor={{ true: tokens.color.brandPrimary }}
                thumbColor={
                  Platform.OS === "android" ? tokens.color.surface : undefined
                }
                disabled={disabled || !form.active}
                value={form.contact_shared}
                onValueChange={(contact_shared) => change({ contact_shared })}
              />
            </View>
          </View>
          <Text style={typeStyles.secondary}>资料由本人填写</Text>
          {existing ? (
            <ActionButton
              label={form.active ? "停用团队" : "重新启用团队"}
              variant="text"
              disabled={disabled}
              onPress={() =>
                form.active
                  ? Alert.alert(
                      "停用团队？",
                      "保存后不能以团队名义发布，历史发布保持原样。",
                      [
                        { text: "取消", style: "cancel" },
                        {
                          text: "停用",
                          style: "destructive",
                          onPress: () =>
                            change({ active: false, contact_shared: false }),
                        },
                      ],
                    )
                  : change({ active: true })
              }
            />
          ) : null}
        </>
      )}
    </PageFrame>
  );
}
