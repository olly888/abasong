BEGIN;
ALTER TABLE abasong.posts
  ADD COLUMN topic text CHECK(topic IN ('delivery_question','experience','on_the_road')),
  ADD COLUMN region_id uuid REFERENCES abasong.regions(id);
CREATE INDEX posts_author_feed ON abasong.posts(author_id,created_at DESC,id DESC) WHERE status='visible';
CREATE INDEX comments_post_feed ON abasong.comments(post_id,created_at DESC,id DESC) WHERE status='visible';

ALTER TABLE abasong.notifications ADD COLUMN circle_comment_id uuid REFERENCES abasong.comments(id);
ALTER TABLE abasong.notifications ADD CONSTRAINT circle_notification_target CHECK(
  (kind='circle_reply' AND object_type='post' AND circle_comment_id IS NOT NULL)
  OR (kind<>'circle_reply' AND circle_comment_id IS NULL)
);
CREATE UNIQUE INDEX circle_notification_once ON abasong.notifications(user_id,circle_comment_id) WHERE circle_comment_id IS NOT NULL;
CREATE INDEX notifications_owner_feed ON abasong.notifications(user_id,created_at DESC,id DESC);

-- The worker can revalidate delivery eligibility with metadata only.
GRANT SELECT(id,author_id,status) ON abasong.posts TO abasong_worker;
GRANT SELECT(id,post_id,author_id,status) ON abasong.comments TO abasong_worker;
CREATE POLICY worker_circle_posts ON abasong.posts FOR SELECT TO abasong_worker USING(true);
CREATE POLICY worker_circle_comments ON abasong.comments FOR SELECT TO abasong_worker USING(true);

CREATE FUNCTION abasong.circle_reply_visible(post_id uuid, comment_id uuid, recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1 FROM abasong.posts p
   JOIN abasong.comments c ON c.post_id=p.id
   JOIN abasong.users u ON u.id=p.author_id AND u.status='active'
   JOIN abasong.users v ON v.id=c.author_id AND v.status='active'
   WHERE p.id=$1 AND c.id=$2 AND p.author_id=$3 AND c.author_id<>$3
     AND p.status='visible' AND c.status='visible'
     AND NOT EXISTS (
       SELECT 1 FROM abasong.blocks b
       WHERE (b.blocker_id=$3 AND b.blocked_id=c.author_id)
          OR (b.blocker_id=c.author_id AND b.blocked_id=$3)
     )
 );
$$;
REVOKE ALL ON FUNCTION abasong.circle_reply_visible(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.circle_reply_visible(uuid,uuid,uuid) TO abasong_api,abasong_worker;
INSERT INTO abasong.schema_version(version) VALUES('V12.0021');
COMMIT;
