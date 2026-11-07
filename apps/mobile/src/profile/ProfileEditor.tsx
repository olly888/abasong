import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useFocusEffect, usePreventRemove } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";
import { availabilityConflict } from "../drivers/availability-session";
import {
  createProfileSession,
  profileFields,
  readProfileDraft,
  rememberProfileDraft,
  clearProfileDraft,
  type ProfileFields,
  type ProfileRequest,
  type SelfProfile,
} from "./profile-session";
const carriers = [
  "GOFO",
  "SwiftX",
  "SpeedX",
  "UniUni",
  "Amazon Flex",
  "DoorDash",
];
export function ProfileEditor({
  request,
  owner,
  onBack,
  onSaved,
  onTeam,
  testControls,
}: {
  request: ProfileRequest;
  owner: string;
  onBack: () => void;
  onSaved: (p: SelfProfile) => void;
  onTeam?: () => void;
  testControls?: ReactNode;
}) {
  const availability = useRef<components["schemas"]["Availability"] | null>(
    null,
  );
  const editor = useMemo(
    () => createProfileSession(request, owner, randomUUID),
    [request, owner],
  );
  const [saved, setSaved] = useState<SelfProfile | null>(null),
    [form, setForm] = useState<ProfileFields | null>(null),
    [regions, setRegions] = useState<components["schemas"]["Region"][]>([]),
    [regionError, setRegionError] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [leaving, setLeaving] = useState(false),
    [contacts, setContacts] = useState(false);
  const working = useRef(false),
    visible = useRef(false),
    discard = useRef(false),
    loadEpoch = useRef(0),
    loadController = useRef<AbortController | null>(null);
  const dirty =
    !!form &&
    !!saved &&
    JSON.stringify(form) !== JSON.stringify(profileFields(saved));
  const load = useCallback(
    async (restore = true) => {
      const epoch = ++loadEpoch.current;
      loadController.current?.abort();
      const ctrl = new AbortController();
      loadController.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const [p, r, av] = await Promise.allSettled([
          editor.load(),
          request<components["schemas"]["RegionPage"]>(
            "/v1/regions?limit=100",
            { signal: ctrl.signal },
          ),
          request<components["schemas"]["Availability"]>(
            "/v1/me/availability",
            { signal: ctrl.signal },
          ).catch((e) => {
            if (e?.status === 404 && e?.code === "NOT_FOUND") return null;
            throw e;
          }),
        ]);
        if (!visible.current || epoch !== loadEpoch.current) return;
        if (p.status === "rejected") throw p.reason;
        if (!p.value) return;
        availability.current = av.status === "fulfilled" ? av.value : null;
        setSaved(p.value);
        const d = restore ? readProfileDraft(owner) : undefined;
        setForm(d?.fields ?? profileFields(p.value));
        setConflict(!!d && d.version !== p.value.version);
        setRegions(r.status === "fulfilled" ? r.value.items : []);
        setRegionError(
          r.status === "rejected" ? "区域暂时无法读取，已有选择保留" : null,
        );
        if (d && d.version !== p.value.version)
          setError("资料已更新，请读取最新资料后再修改");
      } catch (e) {
        if (visible.current && epoch === loadEpoch.current)
          setError(e instanceof Error ? e.message : "资料暂时无法读取");
      } finally {
        if (visible.current && epoch === loadEpoch.current) setLoading(false);
      }
    },
    [editor, owner, request],
  );
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      void load();
      return () => {
        visible.current = false;
        loadEpoch.current++;
        loadController.current?.abort();
        editor.cancel();
      };
    }, [editor, load]),
  );
  useEffect(() => {
    if (form && saved && !discard.current) {
      if (dirty) rememberProfileDraft(owner, saved.version, form);
      else clearProfileDraft();
    }
  }, [form, saved, dirty, owner]);
  const leave = (keep: boolean) => {
    discard.current = true;
    if (keep && form && saved) rememberProfileDraft(owner, saved.version, form);
    else clearProfileDraft();
    setLeaving(true);
    disablePrevention();
    onBack();
  };
  const choices = () => [
    { text: "继续编辑", style: "cancel" as const },
    { text: "保留草稿并返回", onPress: () => leave(true) },
    {
      text: "放弃草稿",
      style: "destructive" as const,
      onPress: () => leave(false),
    },
  ];
  const disablePrevention = usePreventRemove(
    !leaving && (dirty || busy),
    () => {
      if (!working.current) Alert.alert("离开个人资料？", "", choices());
    },
  );
  const back = () => {
    if (working.current) return;
    if (dirty) Alert.alert("离开个人资料？", "", choices());
    else leave(false);
  };
  const change = <K extends keyof ProfileFields>(
    key: K,
    value: ProfileFields[K],
  ) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setError(null);
  };
  async function save(closeVersion?: number, confirmed = false) {
    if (!form || working.current || conflict) return;
    if (
      !confirmed &&
      saved?.purposes.includes("delivery") &&
      !form.purposes.includes("delivery")
    ) {
      const av = availability.current;
      if (av?.enabled && Date.parse(av.ends_at) > Date.now()) {
        Alert.alert(
          "同时关闭接活状态？",
          "关闭接活用途后，也可保留本次时段。",
          [
            { text: "继续编辑", style: "cancel" },
            { text: "保留本次时段", onPress: () => void save(undefined, true) },
            { text: "同时关闭", onPress: () => void save(av.version, true) },
          ],
        );
        return;
      }
    }
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!form.display_name.trim()) throw new Error("请填写显示名");
      if (
        regionError &&
        form.familiar_region_ids.some(
          (id) => !saved?.familiar_region_ids.includes(id),
        )
      )
        throw new Error("请重新读取区域");
      const p = await editor.save(form, closeVersion);
      if (!visible.current || !p) return;
      discard.current = true;
      clearProfileDraft();
      setLeaving(true);
      disablePrevention();
      onSaved(p);
    } catch (e) {
      if (visible.current) {
        setConflict(availabilityConflict(e));
        setError(e instanceof Error ? e.message : "保存结果未确认，请重试");
      }
    } finally {
      working.current = false;
      if (visible.current) setBusy(false);
    }
  }
  const pill = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: busy || conflict }}
      disabled={busy || conflict}
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
          { color: selected ? tokens.color.brandText : tokens.color.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <PageFrame
      compact
      title="个人资料"
      onBack={back}
      footer={
        <>
          <FormError message={error} />
          {conflict ? (
            <ActionButton
              label="读取最新资料"
              onPress={() =>
                Alert.alert("读取最新资料？", "会替换本次未保存的填写。", [
                  { text: "继续编辑", style: "cancel" },
                  {
                    text: "读取并替换",
                    onPress: () => {
                      clearProfileDraft();
                      void load(false);
                    },
                  },
                ])
              }
            />
          ) : (
            <ActionButton
              label="保存资料"
              busy={busy}
              disabled={loading || !form || !dirty}
              onPress={() => void save()}
            />
          )}
        </>
      }
    >
      {testControls}
      {loading ? (
        <Text style={typeStyles.secondary}>正在读取资料…</Text>
      ) : !form ? (
        <ActionButton label="重新读取" onPress={() => void load()} />
      ) : (
        <>
          <Field
            label="显示名"
            value={form.display_name}
            maxLength={60}
            editable={!busy && !conflict}
            onChangeText={(v) => change("display_name", v)}
          />
          <Field
            label="简短介绍（选填）"
            value={form.bio}
            maxLength={500}
            multiline
            editable={!busy && !conflict}
            onChangeText={(v) => change("bio", v)}
          />
          <View style={{ gap: 12 }}>
            <Text style={typeStyles.title}>使用用途</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {(["delivery", "dsp"] as const).map((v) =>
                pill(
                  v === "delivery" ? "我接临时配送" : "我代表 DSP 找人",
                  form.purposes.includes(v),
                  () =>
                    change(
                      "purposes",
                      form.purposes.includes(v)
                        ? form.purposes.filter((x) => x !== v)
                        : [...form.purposes, v],
                    ),
                ),
              )}
            </View>
          </View>
          {form.purposes.includes("delivery") ? (
            <>
              <View style={{ gap: 12 }}>
                <Text style={typeStyles.title}>配送经验</Text>
                <Text style={typeStyles.secondary}>
                  配送过的快递公司 · 本人填写
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {carriers.map((c) =>
                    pill(
                      c,
                      form.experience.some((x) => x.carrier === c),
                      () =>
                        change(
                          "experience",
                          form.experience.some((x) => x.carrier === c)
                            ? form.experience.filter((x) => x.carrier !== c)
                            : [
                                ...form.experience,
                                {
                                  carrier: c,
                                  region_label: "",
                                  description: "",
                                },
                              ].slice(0, 20),
                        ),
                    ),
                  )}
                </View>
                {form.experience.map((x, i) =>
                  !carriers.includes(x.carrier) ? (
                    <View key={i} style={{ gap: 8 }}>
                      <Field
                        label="其他快递公司"
                        value={x.carrier}
                        maxLength={80}
                        editable={!busy && !conflict}
                        onChangeText={(v) =>
                          change(
                            "experience",
                            form.experience.map((y, j) =>
                              j === i ? { ...y, carrier: v } : y,
                            ),
                          )
                        }
                      />
                      <ActionButton
                        label="移除此公司"
                        variant="text"
                        disabled={busy || conflict}
                        onPress={() =>
                          change(
                            "experience",
                            form.experience.filter((_, j) => i !== j),
                          )
                        }
                      />
                    </View>
                  ) : null,
                )}
                <ActionButton
                  label="添加其他快递公司"
                  variant="text"
                  disabled={busy || conflict || form.experience.length >= 20}
                  onPress={() =>
                    change("experience", [
                      ...form.experience,
                      { carrier: "", region_label: "", description: "" },
                    ])
                  }
                />
              </View>
              <View style={{ gap: 12 }}>
                <Text style={typeStyles.title}>熟悉区域（最多5个）</Text>
                <FormError message={regionError} />
                {regionError ? (
                  <ActionButton
                    label="重新读取区域"
                    secondary
                    onPress={() => void load()}
                  />
                ) : (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                  >
                    {regions.map((r) =>
                      pill(
                        r.label,
                        form.familiar_region_ids.includes(r.id),
                        () => {
                          if (form.familiar_region_ids.includes(r.id))
                            change(
                              "familiar_region_ids",
                              form.familiar_region_ids.filter(
                                (id) => id !== r.id,
                              ),
                            );
                          else if (form.familiar_region_ids.length < 5)
                            change("familiar_region_ids", [
                              ...form.familiar_region_ids,
                              r.id,
                            ]);
                          else setError("最多选择5个熟悉区域");
                        },
                      ),
                    )}
                  </View>
                )}
              </View>
              <Field
                label="车型（选填）"
                value={form.vehicle_type}
                maxLength={60}
                editable={!busy && !conflict}
                placeholder="如 Sedan、SUV、Van"
                onChangeText={(v) => change("vehicle_type", v)}
              />
            </>
          ) : null}
          <View style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="联系方式（选填）"
              onPress={() => setContacts(!contacts)}
              style={{ minHeight: 48, justifyContent: "center" }}
            >
              <Text style={typeStyles.title}>
                联系方式（选填） {contacts ? "−" : "＋"}
              </Text>
            </Pressable>
            <Text style={typeStyles.secondary}>
              仅自己可见，可在聊天中自愿提供。
            </Text>
            {contacts ? (
              <>
                <Field
                  label="联系电话"
                  value={form.private_contact.phone}
                  maxLength={40}
                  keyboardType="phone-pad"
                  autoComplete="off"
                  editable={!busy && !conflict}
                  onChangeText={(v) =>
                    change("private_contact", {
                      ...form.private_contact,
                      phone: v,
                    })
                  }
                />
                <Field
                  label="微信"
                  value={form.private_contact.wechat}
                  maxLength={80}
                  autoCapitalize="none"
                  autoComplete="off"
                  editable={!busy && !conflict}
                  onChangeText={(v) =>
                    change("private_contact", {
                      ...form.private_contact,
                      wechat: v,
                    })
                  }
                />
              </>
            ) : null}
          </View>
          {onTeam ? (
            <ActionButton
              label="团队资料（DSP）"
              variant="text"
              disabled={busy}
              onPress={onTeam}
            />
          ) : null}
        </>
      )}
    </PageFrame>
  );
}
