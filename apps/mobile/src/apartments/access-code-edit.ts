export const accessCodeLimit = 32;
export type CodeSelection = { start: number; end: number };
export type CodeDraft = { value: string; selection: CodeSelection };

export function accessCodeDraft(value: string): CodeDraft {
  return { value, selection: { start: value.length, end: value.length } };
}

export function editAccessCode(
  { value, selection }: CodeDraft,
  edit: { insert: string } | "delete",
): CodeDraft | null {
  let { start, end } = selection;
  const insertion = edit === "delete" ? "" : edit.insert;
  if (edit === "delete" && start === end && start > 0) {
    const previous = Array.from(value.slice(0, start)).at(-1);
    start -= previous?.length ?? 1;
  }
  if (
    edit !== "delete" &&
    (!insertion || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(insertion))
  )
    return null;
  const next = value.slice(0, start) + insertion + value.slice(end);
  if (edit !== "delete" && next.length > accessCodeLimit) return null;
  end = start + insertion.length;
  return { value: next, selection: { start: end, end } };
}

export function spokenCodeCharacter(character: string) {
  return character === "#" ? "井号" : character === "*" ? "星号" : character;
}
