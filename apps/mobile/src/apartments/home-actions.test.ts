import { expect, it, vi } from "vitest";
import {
  apartmentResume,
  recenterHome,
  rememberApartmentDestination,
} from "./home-actions";
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
it("a newly shared address supersedes an old destination and camera without losing neighbouring cards", () => {
  const memory = {
    apartmentId: "a",
    destinationKey: "old-search",
    camera: { zoom: 17 },
    scroll: 540,
    nearby: ["a", "b"],
  };
  rememberApartmentDestination(memory, "new-address");
  expect(memory).toMatchObject({
    apartmentId: "new-address",
    pendingFocusId: "new-address",
    nearby: ["a", "b"],
  });
  expect(memory.camera).toBeUndefined();
  expect(memory.destinationKey).toBeUndefined();
});
it("return to the same contributed apartment retains the camera and requests visibility, while ordinary resume changes nothing", () => {
  const memory = { apartmentId: "a", camera: { zoom: 17 }, scroll: 540 };
  rememberApartmentDestination(memory, "a");
  expect(memory).toMatchObject({
    pendingFocusId: "a",
    camera: { zoom: 17 },
    scroll: 540,
  });
  const saved = { ...memory };
  rememberApartmentDestination(memory);
  expect(memory).toEqual(saved);
});
