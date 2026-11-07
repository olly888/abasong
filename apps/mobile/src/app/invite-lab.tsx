import { Redirect, router } from "expo-router";
import { MyAccount } from "../profile/MyAccount";
import type { ProfileRequest } from "../profile/profile-session";

const fixture: ProfileRequest = async <T,>(path: string) => {
  if (path === "/v1/me/profile")
    return {
      profile: { display_name: "TEST 配送司机", experience: [] },
      purposes: ["driver"],
    } as T;
  if (path === "/v1/me/availability") return null as T;
  throw new Error("TEST request unavailable");
};
const noop = () => {};

export default function InviteLab() {
  if (!__DEV__) return <Redirect href="/profile" />;
  return (
    <MyAccount
      request={fixture}
      onProfile={noop}
      onAvailability={noop}
      onShare={noop}
      onMenu={noop}
      onInvite={() =>
        router.push({
          pathname: "/account/invite",
          params: { preview: "local" },
        })
      }
    />
  );
}
