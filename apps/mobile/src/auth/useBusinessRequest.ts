import { useCallback } from "react";
import { useAuth } from "./AuthProvider";
import { dataRequest } from "../apartments/client";
import type { ProfileRequest } from "../profile/profile-session";
export function useBusinessRequest(): ProfileRequest {
  const { session } = useAuth();
  return useCallback<ProfileRequest>(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
}
