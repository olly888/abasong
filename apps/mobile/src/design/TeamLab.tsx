import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { MyAccount } from "../profile/MyAccount";
import { TeamEditor } from "../teams/TeamEditor";
import { DeliveryEditor } from "../requests/DeliveryEditor";
import { DeliveryDetailBody } from "../requests/DeliveryDetailBody";
import { DriverProfileView } from "../drivers/DriverProfileView";
import { RelatedTeam } from "../teams/RelatedTeam";
import { ActionButton, FormError } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";
import { collaborationSeed } from "./collaboration-seed";
import { nativeExitTransport, type ExitFixture } from "./native-exit-transport";

type S = components["schemas"];
type Fixture = ExitFixture & { verify: string };
const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
const owner = nativeExitTransport(base, "owner");
const driver = nativeExitTransport(base, "driver");
const edit = () =>
  router.push({ pathname: "/team-lab", params: { edit: "1" } });

export default function TeamLab() {
  return __DEV__ && Platform.OS !== "web" ? (
    <Lab />
  ) : (
    <Redirect href="/profile" />
  );
}

function Lab() {
  const { edit: editing } = useLocalSearchParams<{ edit?: string }>();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [draft, setDraft] = useState<S["RequestDetailV2"] | null>(null);
  const [published, setPublished] = useState<S["RequestDetailV2"] | null>(null);
  const [profile, setProfile] = useState<S["Driver"] | null>(null);
  const [regions, setRegions] = useState<S["Region"][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void owner<Fixture>("/fixture")
      .then((f) => {
        if (!f.isolated || f.verify !== "team") throw new Error();
        setFixture(f);
      })
      .catch(() => setError("TEST 团队隔离服务未启动"));
  }, []);
  async function op(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("TEST 操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!fixture) return;
    const page = await owner<S["RegionPage"]>("/v1/regions?limit=100");
    setRegions(page.items);
    setDraft(
      await owner<S["RequestDetailV2"]>("/v1/requests", {
        method: "POST",
        key: randomUUID(),
        body: {
          ...collaborationSeed(fixture),
          route_label: "TEST B5-02 Route",
          price_cents: 186,
        },
      }),
    );
  }
  if (!fixture)
    return (
      <PageFrame title="TEST · B5-02">
        <FormError message={error} />
        <Text>仅本机隔离服务</Text>
      </PageFrame>
    );
  if (editing)
    return (
      <TeamEditor
        request={owner}
        contactName="TEST 发布人"
        onBack={() => router.back()}
        onSaved={() => router.back()}
        testControls={
          <>
            <Text>{note || "TEST · 仅隔离库"}</Text>
            <ActionButton
              label="TEST 保存重试"
              variant="text"
              onPress={() =>
                void op(async () => {
                  await owner("/fixture/control", {
                    method: "POST",
                    body: { action: "fault", operation: "team", after: true },
                  });
                  setNote("TEST · 已设置一次响应丢失");
                })
              }
            />
          </>
        }
      />
    );
  if (draft)
    return (
      <DeliveryEditor
        key={draft.id}
        request={owner}
        regions={regions}
        initial={draft}
        identity="TEST 发布人"
        onOpenTeam={edit}
        onReload={() =>
          void op(async () => setDraft(await owner(`/v1/requests/${draft.id}`)))
        }
        onDone={(r) => {
          setDraft(null);
          setPublished(r);
        }}
        testNotice="TEST · B5-02 发布"
      />
    );
  if (profile)
    return (
      <DriverProfileView
        driver={profile}
        busy={busy}
        error={error}
        canContact={false}
        onContact={() => {}}
        onReload={() => {}}
        onBack={() => setProfile(null)}
        team={
          <RelatedTeam
            path={`/v1/drivers/${fixture.owner}/team`}
            request={driver}
          />
        }
      />
    );
  if (published)
    return (
      <PageFrame
        compact
        title="TEST · 历史发布"
        onBack={() => setPublished(null)}
      >
        <FormError message={error} />
        <ActionButton label="编辑团队资料" variant="text" onPress={edit} />
        <ActionButton
          label="按原身份重读"
          variant="text"
          onPress={() =>
            void op(async () => {
              setPublished(await driver(`/v1/requests/${published.id}`));
              setRevision((n) => n + 1);
            })
          }
        />
        <ActionButton
          label={blocked ? "TEST 解除屏蔽" : "TEST 屏蔽"}
          variant="text"
          onPress={() =>
            void op(async () => {
              await owner("/fixture/control", {
                method: "POST",
                body: { action: "block", enabled: !blocked },
              });
              setBlocked(!blocked);
              setRevision((n) => n + 1);
            })
          }
        />
        <DeliveryDetailBody
          key={revision}
          request={published}
          transport={driver}
          regions={Object.fromEntries(regions.map((r) => [r.id, r.label]))}
        />
      </PageFrame>
    );
  return (
    <MyAccount
      request={owner}
      onProfile={edit}
      onTeam={edit}
      onAvailability={() => {}}
      onShare={() => {}}
      onMenu={() => {}}
      testControls={
        <>
          <Text>TEST · B5-02</Text>
          <FormError message={error} />
          <ActionButton
            label="打开预填发布草稿"
            secondary
            busy={busy}
            onPress={() => void op(start)}
          />
          <ActionButton
            label="按司机查看发布人"
            variant="text"
            onPress={() =>
              void op(async () => {
                setProfile(await driver(`/v1/drivers/${fixture.owner}`));
              })
            }
          />
        </>
      }
    />
  );
}
