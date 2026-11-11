import { describe, expect, it, vi } from "vitest";
import { exitImport } from "./navigation";

describe("import exit navigation", () => {
  it("returns to the original page when navigation history exists", () => {
    const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
    exitImport(router);
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("returns a root/deep-link session to My instead of an unhandled GO_BACK", () => {
    const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
    exitImport(router);
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/profile");
    expect(router.back).not.toHaveBeenCalled();
  });
});
