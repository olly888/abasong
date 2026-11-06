import { expect, it, vi } from "vitest";
import { apartmentResume, recenterHome } from "./home-actions";
function actions(blocked = false) {
  return {
    resetApartments: vi.fn(),
    blocked,
    openSettings: vi.fn(),
    moveCamera: vi.fn(),
    refreshLocation: vi.fn(),
  };
}
it("collaboration recenter keeps apartment reading intact, including when location is blocked", () => {
  for (const mode of ["找活", "找人"]) {
    const live = actions();
    recenterHome(mode, live);
    expect(live.resetApartments).not.toHaveBeenCalled();
    expect(live.moveCamera).toHaveBeenCalledOnce();
    expect(live.refreshLocation).toHaveBeenCalledOnce();
    const blocked = actions(true);
    recenterHome(mode, blocked);
    expect(blocked.resetApartments).not.toHaveBeenCalled();
    expect(blocked.openSettings).toHaveBeenCalledOnce();
    expect(blocked.refreshLocation).not.toHaveBeenCalled();
  }
});
it("apartment recenter explicitly releases reading and resumes discovery", () => {
  const a = actions();
  recenterHome("公寓", a);
  expect(a.resetApartments).toHaveBeenCalledOnce();
  expect(a.moveCamera).toHaveBeenCalledOnce();
  expect(a.refreshLocation).toHaveBeenCalledOnce();
});
it("a manual apartment/destination is retained, while an automatic card is rediscovered on mode return", () => {
  expect(apartmentResume(true, true)).toBe("reload_selection");
  expect(apartmentResume(true, false)).toBe("keep_destination");
  expect(apartmentResume(false, true)).toBe("discover");
  expect(apartmentResume(false, false)).toBe("discover");
});
