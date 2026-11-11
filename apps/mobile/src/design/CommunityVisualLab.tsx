import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CircleComposer } from "../circle/CircleComposer";
import { CircleFeed } from "../circle/CircleFeed";
import { CirclePostCard } from "../circle/CirclePostCard";
import { type Circle, type CircleRequest } from "../circle/session";
import { MyAccount } from "../profile/MyAccount";
import { ProfileEditor } from "../profile/ProfileEditor";
import type { SelfProfile } from "../profile/profile-session";
import { ActionButton } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";

const profileSeed: SelfProfile = {
  profile: {
    user_id: "TEST-M6",
    display_name: "TEST 阿杰",
    bio: "配送经验由本人填写",
    vehicle_type: "SUV",
    experience: [],
  },
  version: 1,
  purposes: ["delivery", "dsp"],
  familiar_region_ids: [],
  private_contact: { phone: "", wechat: "" },
};
const postSeed: Circle["Post"] = {
  id: "TEST-post",
  author: { user_id: "TEST-M6", display_name: "TEST 阿杰" },
  body: "今天在公寓门外核对了门牌。遇到地址不一致，先确认收件地址，再联系发布人。大家有什么核对经验？",
  topic: "experience",
  region: { id: "TEST-region", label: "TEST West Covina" },
  has_request: false,
  request: null,
  media: [],
  reply_count: 2,
  created_at: "2026-11-08T18:00:00Z",
};
export default function CommunityVisualLab() {
  const { scene = "composer" } = useLocalSearchParams<{ scene?: string }>();
  return __DEV__ ? <Lab key={scene} scene={scene} /> : <Redirect href="/" />;
}
function Lab({ scene }: { scene: string }) {
  const [view, setView] = useState(scene);
  const [revision, revise] = useState(0);
  const [note, setNote] = useState("TEST · M6-01 · 仅内存，不连接业务服务");
  const [post, setPost] = useState(postSeed);
  const request = useMemo(() => {
    let profile = {
        ...profileSeed,
        profile: { ...profileSeed.profile },
        private_contact: { ...profileSeed.private_contact },
      },
      regionCalls = 0,
      postCalls = 0,
      closeCalls = 0,
      feedCalls = 0;
    const availability: Circle["Availability"] = {
      user_id: "TEST-M6",
      version: 1,
      enabled: true,
      currently_available: true,
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
      region_ids: ["TEST-region"],
      capacity_parcels: null,
      latest_finish_at: null,
    };
    let attemptKey: string | undefined;
    const run: CircleRequest = async <T,>(
      path: string,
      o?: Parameters<CircleRequest>[1],
    ) => {
      if (o?.signal?.aborted) throw Error("TEST cancelled");
      if (path === "/v1/me/profile") {
        if (o?.method === "PATCH") {
          const b = o.body as Circle["ProfilePatch"];
          profile = {
            ...profile,
            version: profile.version + 1,
            profile: {
              ...profile.profile,
              display_name: b.display_name,
              bio: b.bio ?? null,
              vehicle_type: b.vehicle_type ?? null,
              experience: b.experience.map((e) => ({
                ...e,
                source: "self_reported" as const,
              })),
            },
            purposes: b.purposes,
            familiar_region_ids: b.familiar_region_ids,
            private_contact: b.private_contact,
          };
        }
        return profile as T;
      }
      if (path.includes("/organization"))
        return { team: { name: "TEST 配送团队" } } as T;
      if (path === "/v1/me/availability") {
        if (o?.method === "PUT") {
          if (closeCalls++ === 0)
            throw Error("TEST · 未能关闭接活状态，请重试");
          availability.enabled = false;
        }
        return { ...availability } as T;
      }
      if (path.startsWith("/v1/regions")) {
        if (scene === "composer" && regionCalls++ === 0)
          throw Error("TEST · 地区失败");
        return {
          items: [
            {
              id: "TEST-region",
              label: "TEST West Covina",
              timezone: "America/Los_Angeles",
              display_point: { lat: 34, lng: -118 },
            },
          ],
          next_cursor: null,
        } as T;
      }
      if (path.startsWith("/v1/me/requests")) throw Error("TEST · 需求失败");
      if (path === "/v1/posts" && o?.method === "POST") {
        if (postCalls++ === 0) {
          attemptKey = o.key;
          throw Error("TEST · 发布结果未确认，请重试");
        }
        if (attemptKey !== o.key)
          throw Error("TEST · 重试错误地更换了提交标识");
        const input = o.body as Circle["PostInput"];
        setNote("TEST · 发布成功，同一提交标识");
        return {
          ...postSeed,
          body: input.body,
          topic: input.topic ?? null,
        } as T;
      }
      if (path.startsWith("/v1/posts?")) {
        if (scene === "feed-error" && feedCalls++ === 0)
          throw Error("TEST · 加载失败");
        return {
          items: scene === "feed-empty" ? [] : [postSeed],
          next_cursor: null,
        } as T;
      }
      throw Error("TEST · 未定义请求");
    };
    return run;
  }, [scene]);
  const back = () => {
    setView("my");
    revise((n) => n + 1);
  };
  const controls = <Text style={{ padding: 8, fontSize: 12 }}>{note}</Text>;
  const info = (v: string) => setNote("TEST · " + v);
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={["top"]}>{controls}</SafeAreaView>
      {view === "composer" ? (
        <CircleComposer
          actor="TEST-M6-composer"
          request={request}
          onBack={() => setView("feed")}
          onDone={(p) => {
            setPost(p);
            setView("post");
          }}
        />
      ) : view === "my" ? (
        <MyAccount
          key={revision}
          request={request}
          onProfile={() => setView("profile")}
          onTeam={() => info("团队资料")}
          onInvite={() => info("邀请司机")}
          onShare={() => info("共享门禁码")}
          onMenu={info}
          onAvailability={() => info("打开接活设置；尚未保存")}
        />
      ) : view === "profile" ? (
        <ProfileEditor
          owner="TEST-M6"
          request={request}
          onBack={back}
          onSaved={back}
        />
      ) : view === "post" ? (
        <PageFrame compact title="动态详情" onBack={() => setView("feed")}>
          <CirclePostCard
            post={post}
            request={request}
            onAuthor={() => info("本人资料")}
            onRequest={() => info("需求")}
          />
          <ActionButton label="返回司机圈" onPress={() => setView("feed")} />
        </PageFrame>
      ) : (
        <CircleFeed
          request={request}
          onPublish={() => setView("composer")}
          onNewRequest={() => info("发需求")}
          onOpen={() => {
            setPost(postSeed);
            setView("post");
          }}
          onAuthor={() => info("本人资料")}
          onRequest={() => info("需求")}
        />
      )}
    </View>
  );
}
