import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, usePreventRemove } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AuthPage, ActionButton, FormError } from "../auth/AuthControls";
import { AccountError } from "../auth/api-client";
import { ListRow } from "../ui/Primitives";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import {
  changeDeliveryField,
  defaultDeliveryFields,
  DeliveryFieldError,
  type DeliveryAnchor,
  deliveryInput,
  hydrateDelivery,
  type DeliveryFields,
  type Scenario,
} from "./delivery-fields";
import { ownTeam, teamError, type OwnTeamSummary } from "../teams/team-client";
import {
  createDeliveryWriter,
  type DeliveryTeamIntent,
} from "./delivery-writer";
import {
  DeliveryDisclosureRow,
  DeliveryForm,
  type DeliveryAnchorWrap,
  type DeliveryDisclosure,
} from "./DeliveryForm";
import { DeliveryReview } from "./DeliveryReview";
import { metrics } from "../ui/foundation";
import { Choice, requestStyles as s } from "./RequestUi";
import { scenarioLabels, type DeliveryRequest } from "./presentation";
type S = components["schemas"];
export function DeliveryEditor({
  request,
  regions,
  identity,
  initial = null,
  copy = false,
  onDone,
  onReload,
  onOpenTeam,
  testNotice,
  testControls,
}: {
  request: ContributionRequest;
  regions: S["Region"][];
  identity: string;
  initial?: DeliveryRequest | null;
  copy?: boolean;
  onDone: (r: S["RequestDetailV2"], published: boolean) => void;
  onReload: () => void;
  onOpenTeam?: () => void;
  testNotice?: string;
  testControls?: React.ReactNode;
}) {
  const seed = useMemo(
    () => (initial ? hydrateDelivery(initial, copy) : null),
    [initial, copy],
  );
  const [scenario, setScenario] = useState<Scenario | null>(
      seed?.scenario ?? null,
    ),
    [form, setForm] = useState<DeliveryFields>(
      seed?.fields ?? defaultDeliveryFields("warehouse_shortage"),
    ),
    [review, setReview] = useState<S["RequestDraftInputV2"] | null>(null),
    [fieldError, setFieldError] = useState<DeliveryFieldError | null>(null),
    [open, setOpen] = useState<Record<DeliveryDisclosure, boolean>>({
      identity: false,
      pickupKind: false,
      conditions: false,
      schedule: false,
      extra: false,
    }),
    [jump, setJump] = useState<{
      field?: DeliveryAnchor;
      offset?: number;
    } | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false);
  const writer = useMemo(
    () =>
      createDeliveryWriter(
        request,
        randomUUID,
        !copy && initial && "request_schema_version" in initial
          ? initial
          : null,
      ),
    [request, initial, copy],
  );
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const content = useRef<ComponentRef<typeof View>>(null);
  const anchors = useRef(new Map<DeliveryAnchor, ComponentRef<typeof View>>());
  const lastOffset = useRef(0);
  useEffect(() => {
    if (review || !jump) return;
    let timer: ReturnType<typeof setTimeout>;
    let canceled = false;
    const retry = (n: number) => {
      if (n < 5 && !canceled) timer = setTimeout(() => locate(n + 1), 50);
    };
    function locate(attempt: number) {
      if (canceled || !jump) return;
      if (jump.offset !== undefined) {
        scroll.current?.scrollTo({ y: jump.offset, animated: false });
        return;
      }
      const node = jump.field ? anchors.current.get(jump.field) : null;
      if (!node || !content.current || !scroll.current) return retry(attempt);
      node.measureLayout(
        content.current,
        (_x, y) => {
          if (canceled) return;
          scroll.current?.scrollTo({
            y: Math.max(0, y + metrics.inset - 8),
            animated: true,
          });
          if (fieldError?.field === jump.field && fieldError)
            AccessibilityInfo.announceForAccessibility(fieldError.message);
        },
        () => retry(attempt),
      );
    }
    timer = setTimeout(() => locate(0), 50);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [jump, review, fieldError]);
  const toggle = (section: DeliveryDisclosure) =>
    setOpen((state) => ({ ...state, [section]: !state[section] }));
  const showField = (field: DeliveryAnchor) => {
    const section =
      field === "identity"
        ? "identity"
        : field === "conditions" || field === "deliveryEnd"
          ? "conditions"
          : field === "schedule" ||
              field === "pickupEnd" ||
              field === "endDate" ||
              field === "end"
            ? "schedule"
            : field === "extra" || field === "minimum"
              ? "extra"
              : null;
    if (section) setOpen((state) => ({ ...state, [section]: true }));
    setJump({ field });
  };
  const edit = (field?: DeliveryAnchor) => {
    setReview(null);
    setError(null);
    if (field) showField(field);
    else setJump({ offset: lastOffset.current });
  };
  const anchor: DeliveryAnchorWrap = (id, children, aliases = []) => {
    const ids = [id, ...aliases];
    const issue =
      fieldError && ids.includes(fieldError.field) ? fieldError.message : null;
    return (
      <View
        collapsable={false}
        testID={`delivery-field-${id}`}
        ref={(node) => {
          for (const key of ids) {
            if (node) anchors.current.set(key, node);
            else anchors.current.delete(key);
          }
        }}
        style={{
          gap: 4,
          ...(issue
            ? { backgroundColor: tokens.color.surfaceMuted, borderRadius: 8 }
            : {}),
        }}
      >
        {children}
        <FormError message={issue} />
      </View>
    );
  };
  const lock = useRef(false),
    mounted = useRef(true),
    leaving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disablePrevention = usePreventRemove(
    dirty || !!review || busy,
    ({ repeat }) => {
      if (leaving.current) {
        repeat();
        return;
      }
      if (lock.current) return;
      if (review) {
        edit();
        return;
      }
      Alert.alert("离开这次填写？", undefined, [
        { text: "继续填写", style: "cancel" },
        {
          text: "放弃修改",
          style: "destructive",
          onPress: () => {
            leaving.current = true;
            repeat();
          },
        },
      ]);
    },
  );
  const update = <K extends keyof DeliveryFields>(
    key: K,
    value: DeliveryFields[K],
  ) => {
    setForm((f) => changeDeliveryField(f, key, value));
    setDirty(true);
    setError(null);
    setFieldError(null);
    setJump(null);
  };
  const published = !copy && initial?.status !== "draft" && !!initial;
  const [team, setTeam] = useState<OwnTeamSummary | null>(null);
  const [teamId, setTeamId] = useState(
    !copy ? (initial?.organization?.id ?? "") : "",
  );
  const [teamState, setTeamState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const teamLoad = useRef<AbortController | null>(null);
  const reviewedTeam = useRef<DeliveryTeamIntent | undefined>(undefined);
  const teamEnabled = !!onOpenTeam && !published;
  const loadTeam = useCallback(async () => {
    if (!teamEnabled) return;
    teamLoad.current?.abort();
    const c = new AbortController();
    teamLoad.current = c;
    setTeamState("loading");
    try {
      const t = await ownTeam<OwnTeamSummary>(request, c.signal, true);
      if (c.signal.aborted) return;
      setTeam(t);
      setTeamState("loaded");
    } catch {
      if (!c.signal.aborted) setTeamState("error");
    }
  }, [request, teamEnabled]);
  useFocusEffect(
    useCallback(() => {
      void loadTeam();
      return () => teamLoad.current?.abort();
    }, [loadTeam]),
  );
  function teamChoice(): DeliveryTeamIntent | undefined {
    if (!teamEnabled) return undefined;
    if (!teamId) return null;
    if (
      teamState !== "loaded" ||
      !team?.can_represent ||
      team.team.id !== teamId
    )
      throw new DeliveryFieldError(
        "identity",
        "当前团队不能代表发布，请检查团队资料或选择个人",
      );
    return { id: team.team.id, version: team.version, name: team.team.name };
  }
  function reportField(e: DeliveryFieldError) {
    setReview(null);
    setError(null);
    setFieldError(e);
    showField(e.field);
  }
  function check() {
    if (!scenario) return;
    try {
      const input = deliveryInput(scenario, form, true, writer.current());
      reviewedTeam.current = teamChoice();
      Keyboard.dismiss();
      setError(null);
      setFieldError(null);
      setJump(null);
      setReview(input);
    } catch (e) {
      Keyboard.dismiss();
      if (e instanceof DeliveryFieldError) reportField(e);
      else setError(e instanceof Error ? e.message : "请检查本次填写");
    }
  }
  async function save(publish: boolean) {
    if (!scenario || lock.current || conflict) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const result = await writer.save(
        deliveryInput(scenario, form, publish, writer.current()),
        publish,
        publish ? reviewedTeam.current : teamChoice(),
      );
      if (!mounted.current) return;
      leaving.current = true;
      setDirty(false);
      disablePrevention();
      onDone(result, publish);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof DeliveryFieldError) {
        reportField(e);
        return;
      }
      if (e instanceof AccountError && e.code === "VERSION_CONFLICT")
        setConflict(true);
      if (
        teamError(e, "TEAM_CHANGED") ||
        teamError(e, "ORGANIZATION_REQUIRED")
      ) {
        reportField(
          new DeliveryFieldError(
            "identity",
            "团队资料有变化，请重新核对发布身份",
          ),
        );
        void loadTeam();
        return;
      }
      setError(e instanceof Error ? e.message : "保存失败，填写内容已保留");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const regionLabel = (id: string) =>
    regions.find((r) => r.id === id)?.label ?? "未选择";
  if (!scenario)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: tokens.color.overlay,
          justifyContent: "flex-end",
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: tokens.color.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "85%",
            paddingHorizontal: 20,
            paddingTop: 24,
          }}
        >
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
            {testControls}
            <Text style={s.headline}>发需求</Text>
            {testNotice ? <Text style={s.secondary}>{testNotice}</Text> : null}
            <ListRow
              title={scenarioLabels.warehouse_shortage}
              subtitle="临时缺人或包裹多，需要司机到仓库取件"
              icon="people"
              onPress={() => {
                setScenario("warehouse_shortage");
                setForm(defaultDeliveryFields("warehouse_shortage"));
              }}
            />
            <ListRow
              title={scenarioLabels.delivery_handoff}
              subtitle="把送不完的包裹交给同行代送"
              icon="box"
              onPress={() => {
                setScenario("delivery_handoff");
                setForm(defaultDeliveryFields("delivery_handoff"));
              }}
            />
            <ActionButton
              label="取消"
              variant="text"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/")
              }
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  return (
    <AuthPage
      key={review ? "review" : "form"}
      compact
      title={
        review
          ? published
            ? "核对修改"
            : "核对需求"
          : published
            ? "编辑配送需求"
            : scenarioLabels[scenario]
      }
      onBack={
        review
          ? () => {
              if (!lock.current) edit();
            }
          : undefined
      }
      scrollRef={review ? undefined : scroll}
      contentRef={review ? undefined : content}
      onScroll={
        review
          ? undefined
          : (y) => {
              lastOffset.current = y;
            }
      }
      footer={
        <View style={{ gap: 10 }}>
          <FormError message={error} />
          {conflict ? (
            <ActionButton
              label="重新读取当前需求"
              onPress={() => {
                leaving.current = true;
                disablePrevention();
                onReload();
              }}
            />
          ) : (
            <>
              <ActionButton
                label={
                  review
                    ? `${error ? "重试" : "确认"}${published ? "保存" : "发布"}`
                    : published
                      ? "核对修改"
                      : "核对需求"
                }
                disabled={busy}
                busy={busy}
                onPress={() => (review ? void save(true) : check())}
              />
              {review ? (
                <ActionButton
                  label="返回修改"
                  variant="text"
                  disabled={busy}
                  onPress={() => edit()}
                />
              ) : !published ? (
                <ActionButton
                  label="保存草稿"
                  variant="text"
                  disabled={busy}
                  onPress={() => void save(false)}
                />
              ) : null}
            </>
          )}
        </View>
      }
    >
      {testControls}
      {testNotice ? <Text style={s.secondary}>{testNotice}</Text> : null}
      {review ? (
        <DeliveryReview
          input={review}
          regionLabel={regionLabel}
          identity={
            published
              ? (initial.organization?.name ?? initial.publisher.display_name)
              : (reviewedTeam.current?.name ?? "个人")
          }
          identityEditable={teamEnabled}
          onEdit={edit}
          disabled={busy || conflict}
        />
      ) : (
        <>
          {anchor(
            "identity",
            teamEnabled ? (
              <View style={{ gap: 8 }}>
                <DeliveryDisclosureRow
                  title="发布身份"
                  summary={teamId ? (team?.team.name ?? "团队") : "个人"}
                  open={open.identity}
                  onToggle={() => toggle("identity")}
                  disabled={busy || conflict}
                />
                {open.identity ? (
                  <>
                    <Choice
                      label="选择发布身份"
                      value={teamId}
                      disabled={busy || conflict}
                      options={[
                        ["", "个人"],
                        ...(teamState === "loaded" && team?.can_represent
                          ? [[team.team.id, `代表 ${team.team.name}`] as const]
                          : []),
                      ]}
                      onChange={(id) => {
                        setTeamId(id);
                        setDirty(true);
                        setError(null);
                        setFieldError(null);
                        setJump(null);
                      }}
                    />
                    {teamId &&
                    !team?.can_represent &&
                    teamState === "loaded" ? (
                      <Text style={s.secondary}>
                        原团队不可用，请重新选择发布身份
                      </Text>
                    ) : null}
                    {teamState === "error" ? (
                      <ActionButton
                        label="重新读取团队资料"
                        variant="text"
                        onPress={() => void loadTeam()}
                      />
                    ) : null}
                    {teamState === "loading" ? (
                      <Text style={s.secondary}>正在读取团队资料…</Text>
                    ) : null}
                    {teamState === "loaded" && !team?.can_represent ? (
                      <ActionButton
                        label={team ? "查看团队资料" : "添加团队资料"}
                        variant="text"
                        disabled={busy || conflict}
                        onPress={onOpenTeam}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : (
              <Text style={s.secondary}>
                发布身份 ·{" "}
                {published
                  ? (initial.organization?.name ??
                    initial.publisher.display_name)
                  : identity}
              </Text>
            ),
          )}
          <DeliveryForm
            scenario={scenario}
            form={form}
            regions={regions}
            onChange={update}
            request={request}
            disabled={busy || conflict}
            anchor={anchor}
            open={open}
            toggle={toggle}
          />
        </>
      )}
    </AuthPage>
  );
}
