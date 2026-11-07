BEGIN;
CREATE TABLE abasong.circle_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES abasong.users(id),
  upload_id uuid NOT NULL,
  source_digest bytea NOT NULL CHECK(octet_length(source_digest)=32),
  width integer CHECK(width BETWEEN 1 AND 2048),
  height integer CHECK(height BETWEEN 1 AND 2048),
  post_id uuid REFERENCES abasong.posts(id),
  position smallint CHECK(position BETWEEN 0 AND 2),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,upload_id),
  UNIQUE(post_id,position),
  CHECK((width IS NULL)=(height IS NULL)),
  CHECK((post_id IS NULL)=(position IS NULL)),
  CHECK(post_id IS NULL OR width IS NOT NULL)
);
CREATE INDEX circle_media_expiry ON abasong.circle_media(expires_at,id) WHERE post_id IS NULL;

ALTER TABLE abasong.circle_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.circle_media FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON abasong.circle_media TO abasong_api;
CREATE POLICY api_circle_media ON abasong.circle_media TO abasong_api USING(true) WITH CHECK(true);

GRANT SELECT(id,post_id,expires_at), UPDATE(expires_at), DELETE ON abasong.circle_media TO abasong_worker;
CREATE POLICY worker_circle_media_select ON abasong.circle_media FOR SELECT TO abasong_worker USING(
  (post_id IS NULL AND expires_at<=now())
  OR EXISTS(SELECT 1 FROM abasong.posts p WHERE p.id=post_id AND p.status='removed')
);
CREATE POLICY worker_circle_media_lock ON abasong.circle_media FOR UPDATE TO abasong_worker USING(
  (post_id IS NULL AND expires_at<=now())
  OR EXISTS(SELECT 1 FROM abasong.posts p WHERE p.id=post_id AND p.status='removed')
) WITH CHECK(false);
CREATE POLICY worker_circle_media_delete ON abasong.circle_media FOR DELETE TO abasong_worker USING(
  (post_id IS NULL AND expires_at<=now())
  OR EXISTS(SELECT 1 FROM abasong.posts p WHERE p.id=post_id AND p.status='removed')
);
INSERT INTO abasong.schema_version(version) VALUES('V12.0022');
COMMIT;
