import { expect, it } from "vitest";
import {
  accessCodeDraft,
  editAccessCode,
  spokenCodeCharacter,
} from "./access-code-edit";

it("keeps leading zeros and literal keypad symbols through consecutive taps", () => {
  const draft = Array.from("*0012#").reduce(
    (state, insert) => editAccessCode(state, { insert })!,
    accessCodeDraft(""),
  );
  expect(draft).toEqual(accessCodeDraft("*0012#"));
  expect(Array.from(draft.value, spokenCodeCharacter)).toEqual([
    "星号",
    "0",
    "0",
    "1",
    "2",
    "井号",
  ]);
});

it("corrects the selected characters without shifting or dropping the suffix", () => {
  const original = { value: "#0012*", selection: { start: 3, end: 4 } };
  const edited = editAccessCode(original, { insert: "A" });
  expect(edited).toEqual({ value: "#00A2*", selection: { start: 4, end: 4 } });
  expect(editAccessCode(edited!, "delete")).toEqual({
    value: "#002*",
    selection: { start: 3, end: 3 },
  });
});

it("accepts deliberate single-line paste literally and rejects overflow as a whole", () => {
  const original = { value: "#0012*", selection: { start: 1, end: 5 } };
  expect(editAccessCode(original, { insert: "Fa$1" })?.value).toBe("#Fa$1*");
  expect(editAccessCode(original, { insert: "AB\nCD" })).toBeNull();
  expect(
    editAccessCode(accessCodeDraft("0".repeat(31)), { insert: "*#" }),
  ).toBeNull();
});
