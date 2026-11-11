import { router } from "expo-router";
export const openPost = (id: string, comment?: string) =>
  router.push({
    pathname: "/circle/[id]",
    params: { id, ...(comment ? { comment } : {}) },
  });
export const openAuthor = (id: string) =>
  router.push({ pathname: "/drivers/[id]", params: { id } });
export const openCircleRequest = (id: string) =>
  router.push({ pathname: "/requests/[id]", params: { id } });
export const backToCircle = () =>
  router.canGoBack() ? router.back() : router.replace("/(tabs)/circle");
