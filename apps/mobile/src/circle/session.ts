import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import type { ProfileRequest } from "../profile/profile-session";
export type CircleRequest = ProfileRequest;
export type Circle = components["schemas"];
type Draft<T> = { fields: T; key: string };
const posts = new Map<string, Draft<Circle["PostInput"]>>();
const replies = new Map<string, Draft<Circle["CommentInput"]>>();

export function clearCircleDrafts() {
  posts.clear();
  replies.clear();
}
export function getPostDraft(actor: string) {
  return posts.get(actor) ?? { fields: { body: "" }, key: randomUUID() };
}
export function setPostDraft(actor: string, fields: Circle["PostInput"]) {
  const next = { fields, key: randomUUID() };
  posts.set(actor, next);
  return next;
}
export function forgetPostDraft(actor: string, key?: string) {
  if (!key || posts.get(actor)?.key === key) posts.delete(actor);
}
export function getReplyDraft(actor: string, post: string) {
  return (
    replies.get(actor + ":" + post) ?? {
      fields: { body: "" },
      key: randomUUID(),
    }
  );
}
export function setReplyDraft(actor: string, post: string, body: string) {
  const next = { fields: { body }, key: randomUUID() };
  if (body) replies.set(actor + ":" + post, next);
  else replies.delete(actor + ":" + post);
  return next;
}
export function forgetReplyDraft(actor: string, post: string, key: string) {
  if (replies.get(actor + ":" + post)?.key === key)
    replies.delete(actor + ":" + post);
}
export const circleTopics = {
  delivery_question: "配送提问",
  experience: "经验分享",
  on_the_road: "路上见闻",
} as const;
