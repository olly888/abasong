import { it, expect } from "vitest";
import { createConversationAccess } from "./access-gate";
it("requires fresh foreground authority and ignores late writable responses after blur", () => {
  const gate = createConversationAccess(),
    first = gate.begin();
  expect(gate.canSend(first)).toBe(false);
  gate.accept(first, true);
  expect(gate.canSend(first)).toBe(true);
  gate.invalidate();
  expect(gate.canSend(first)).toBe(false);
  const second = gate.begin();
  expect(gate.accept(first, true)).toBe(false);
  expect(gate.canSend(second)).toBe(false);
  gate.accept(second, false);
  expect(gate.canSend(second)).toBe(false);
  gate.accept(second, true);
  expect(gate.canSend(second)).toBe(true);
  gate.revoke(second);
  expect(gate.canSend(second)).toBe(false);
});
