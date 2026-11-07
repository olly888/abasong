import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { disposePhoto, type CirclePhoto } from "./photo-input";
import type { ProfileRequest } from "../profile/profile-session";
export type CircleRequest = ProfileRequest;
export type Circle = components["schemas"];
type Draft<T> = { fields: T; key: string };
type PostDraft = Draft<Circle["PostInput"]> & {
  photos: CirclePhoto[];
  submission?: Circle["PostInput"];
};
const posts = new Map<string, PostDraft>();
const replies = new Map<string, Draft<Circle["CommentInput"]>>();

export function clearCircleDrafts() {
  for (const draft of posts.values())
    draft.photos.forEach((p) => disposePhoto(p.uri));
  posts.clear();
  replies.clear();
}
export function getPostDraft(actor: string): PostDraft {
  return (
    posts.get(actor) ?? { fields: { body: "" }, key: randomUUID(), photos: [] }
  );
}
export function savePostDraft(actor: string, next: PostDraft) {
  posts.set(actor, next);
  return next;
}
export function newPostIntent(
  actor: string,
  fields: Circle["PostInput"],
  photos: CirclePhoto[],
) {
  return savePostDraft(actor, { fields, photos, key: randomUUID() });
}
export function forgetPostDraft(actor: string, key?: string) {
  const draft = posts.get(actor);
  if (draft && (!key || draft.key === key)) {
    draft.photos.forEach((p) => disposePhoto(p.uri));
    posts.delete(actor);
  }
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
