import { describe, expect, it } from "vitest";
import { getInviteKit } from "./invite-policy";
import content from "./invite-local.json";

describe("B5 invitation distribution boundary", () => {
  it.each([
    { dev: false, localPreview: true, native: true },
    { dev: true, localPreview: false, native: true },
    { dev: true, localPreview: true, native: false },
  ])("never supplies a link for %o", (scope) => {
    expect(getInviteKit(scope)).toBeNull();
  });

  it("uses the fixed poster URL as the only link in the synthetic share text", () => {
    const kit = getInviteKit({ dev: true, localPreview: true, native: true });
    expect(kit).not.toBeNull();
    expect(kit!.url).toBe(content.testUrl);
    expect(kit!.text).toMatch(/^TEST · 仅本机测试\n/);
    expect(kit!.text.match(/https?:\/\/\S+/g)).toEqual([kit!.url]);
    expect(new URL(kit!.url)).toMatchObject({
      hostname: "127.0.0.1",
      pathname: "/invite/",
      search: "",
    });
  });
});
