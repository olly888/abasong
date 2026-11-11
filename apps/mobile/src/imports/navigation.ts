import type { ImperativeRouter } from "expo-router";

// Deep links and restored development sessions can open the import as the
// first screen. Do not dispatch GO_BACK when there is no previous route.
export function exitImport(
  router: Pick<ImperativeRouter, "canGoBack" | "back" | "replace">,
) {
  if (router.canGoBack()) router.back();
  else router.replace("/profile");
}
