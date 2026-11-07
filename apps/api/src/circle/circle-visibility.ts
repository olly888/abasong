export function notBlocked(user: string) {
  return `NOT EXISTS(SELECT 1 FROM abasong.blocks b
    WHERE (b.blocker_id=$1 AND b.blocked_id=${user})
       OR (b.blocker_id=${user} AND b.blocked_id=$1))`;
}
export const postAuthor = `JOIN abasong.users pu ON pu.id=p.author_id AND pu.status='active'
  JOIN abasong.profiles pp ON pp.user_id=p.author_id`;
export const visiblePost = `p.status='visible' AND ${notBlocked("p.author_id")}`;
