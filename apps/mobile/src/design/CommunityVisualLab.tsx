import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CircleComposer } from "../circle/CircleComposer";
import { CircleDetail } from "../circle/CircleDetail";
import { CircleFeed } from "../circle/CircleFeed";
import { type Circle, type CircleRequest } from "../circle/session";
import { MyAccount } from "../profile/MyAccount";
import { ProfileEditor } from "../profile/ProfileEditor";
import type { SelfProfile } from "../profile/profile-session";
import { AccountError } from "../auth/errors";
import { deliveryFixture } from "../requests/delivery-fixtures";

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
  const [view, setView] = useState(
    scene === "dtl-profile"
      ? "profile"
      : scene === "dtl-circle"
        ? "feed"
        : scene,
  );
  const [revision, revise] = useState(0);
  const [note, setNote] = useState("TEST · M6-01 · 仅内存，不连接业务服务");
  const [postId, setPostId] = useState(postSeed.id);
  const request = useMemo(() => {
    let profile = {
        ...profileSeed,
        profile: { ...profileSeed.profile },
        private_contact: { ...profileSeed.private_contact },
      },
      regionCalls = 0,
      postCalls = 0,
      profileSaves = 0,
      closeCalls = 0,
      feedCalls = 0;
    const savedPosts: Circle["Post"][] = [
      scene === "dtl-circle"
        ? {
            ...postSeed,
            body: Array(5).fill(postSeed.body).join("\n"),
            reply_count: 1,
          }
        : postSeed,
    ];
    const replies: Circle["Comment"][] = [
      {
        id: "TEST-first-reply",
        post_id: postSeed.id,
        author: { user_id: "TEST-peer", display_name: "TEST 同行" },
        body: "TEST · 先核对街道和门牌。",
        created_at: postSeed.created_at,
      },
    ];
    const sentReplies = new Map<string, Circle["Comment"]>();
    const linkedRequest = {
      ...deliveryFixture(),
      id: "TEST-own-request",
      status: "open" as const,
      region_id: "TEST-region",
      region_label: "TEST West Covina",
      pickup_region_label: "TEST West Covina",
    };
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
          if (scene === "dtl-profile" && profileSaves++ === 0)
            throw Error("TEST · 资料暂未保存，请重试");
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
        if (
          (scene === "composer" || scene === "dtl-profile") &&
          regionCalls++ === 0
        )
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
      if (path.startsWith("/v1/me/requests")) {
        if (scene !== "dtl-circle") throw Error("TEST · 需求失败");
        return { items: [linkedRequest], next_cursor: null } as T;
      }
      if (path === "/v1/posts" && o?.method === "POST") {
        if (postCalls++ === 0) {
          attemptKey = o.key;
          throw Error("TEST · 发布结果未确认，请重试");
        }
        if (attemptKey !== o.key)
          throw Error("TEST · 重试错误地更换了提交标识");
        const input = o.body as Circle["PostInput"];
        setNote("TEST · 发布成功，同一提交标识");
        const item: Circle["Post"] = {
          ...postSeed,
          id: "TEST-published",
          body: input.body,
          topic: input.topic ?? null,
          has_request: input.request_id === linkedRequest.id,
          request: input.request_id === linkedRequest.id ? linkedRequest : null,
          reply_count: 0,
        };
        savedPosts.unshift(item);
        return item as T;
      }
      if (path.startsWith("/v1/posts?")) {
        if (scene === "feed-error" && feedCalls++ === 0)
          throw Error("TEST · 加载失败");
        return {
          items: scene === "feed-empty" ? [] : savedPosts.slice(),
          next_cursor: null,
        } as T;
      }
      const detail = /^\/v1\/posts\/([^/?]+)(\/comments)?/.exec(path);
      if (detail) {
        const index = savedPosts.findIndex((p) => p.id === detail[1]);
        const item = savedPosts[index];
        if (!item)
          throw new AccountError(404, "NOT_FOUND", "TEST · 动态不可查看");
        if (o?.method === "DELETE") {
          savedPosts.splice(index, 1);
          return { ok: true } as T;
        }
        if (!detail[2]) return item as T;
        if (o?.method === "POST" && o.key) {
          const previous = sentReplies.get(o.key);
          if (previous) return previous as T;
          const { body } = o.body as Circle["CommentInput"];
          const reply = {
            id: "TEST-reply-" + sentReplies.size,
            post_id: item.id,
            author: item.author,
            body,
            created_at: item.created_at,
          };
          sentReplies.set(o.key, reply);
          replies.unshift(reply);
          savedPosts[index] = { ...item, reply_count: item.reply_count + 1 };
          if (sentReplies.size === 1) throw Error("TEST · 首次回复响应丢失");
          return reply as T;
        }
        return {
          items: replies.filter((r) => r.post_id === item.id),
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
            setPostId(p.id);
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
        <CircleDetail
          actor="TEST-M6"
          id={postId}
          request={request}
          onBack={() => setView("feed")}
          onHome={() => setView("feed")}
          onAuthor={() => info("本人资料")}
          onRequest={() => info("需求")}
        />
      ) : (
        <CircleFeed
          request={request}
          onPublish={() => setView("composer")}
          onNewRequest={() => info("发需求")}
          onOpen={(id) => {
            setPostId(id);
            setView("post");
          }}
          onAuthor={() => info("本人资料")}
          onRequest={() => info("需求")}
        />
      )}
    </View>
  );
}
