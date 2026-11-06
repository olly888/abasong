// Side effects are explicit so a collaboration recenter cannot reset apartment
// reading. A blocked collaboration location attempt also keeps that context.
export function recenterHome(
  mode: string,
  actions: {
    resetApartments: () => void;
    blocked: boolean;
    openSettings: () => void;
    moveCamera: () => void;
    refreshLocation: () => void;
  },
) {
  if (mode === "公寓") actions.resetApartments();
  if (actions.blocked) actions.openSettings();
  else {
    actions.moveCamera();
    actions.refreshLocation();
  }
}
export function apartmentResume(locked: boolean, hasSelection: boolean) {
  return !locked
    ? "discover"
    : hasSelection
      ? "reload_selection"
      : "keep_destination";
}
