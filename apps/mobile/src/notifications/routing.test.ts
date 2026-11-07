import { expect, it } from "vitest";
import { notificationTarget } from "./routing";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
it("routes only current-account allowlisted opaque notification targets", () => {
  const p = {
    version: 1,
    owner_id: owner,
    kind: "conversation",
    object_id: id,
  };
  expect(notificationTarget(p, owner)).toEqual({
    pathname: "/conversations/[id]",
    params: { id },
  });
  expect(notificationTarget({ ...p, kind: "request" }, owner)?.pathname).toBe(
    "/requests/[id]",
  );
  expect(notificationTarget({ ...p, kind: "post" }, owner)).toEqual({
    pathname: "/circle/[id]",
    params: { id },
  });
  for (const data of [
    null,
    { ...p, url: "https://evil.invalid" },
    { ...p, object_id: "../../private" },
    { ...p, details: "private" },
    { ...p, version: 2 },
    { ...p, kind: "unknown" },
  ])
    expect(notificationTarget(data, owner)).toBeNull();
  expect(notificationTarget(p, null)).toBeNull();
  expect(notificationTarget(p, id)).toBeNull();
});
