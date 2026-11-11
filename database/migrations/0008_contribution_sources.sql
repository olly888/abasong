BEGIN;
-- A canonical password may have several independent owners of publication.
-- Ending one source never rewrites its secret, feedback or another source.
CREATE TABLE abasong.access_contribution_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES abasong.access_records(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES abasong.users(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','corrected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 first_contributed_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 replacement_source_id uuid,
 UNIQUE(record_id,user_id), UNIQUE(id,user_id),
 FOREIGN KEY(replacement_source_id,user_id) REFERENCES abasong.access_contribution_sources(id,user_id),
 CHECK(replacement_source_id IS NULL OR (status='corrected' AND replacement_source_id<>id))
);
INSERT INTO abasong.access_contribution_sources(record_id,user_id,first_contributed_at,status)
 SELECT r.id,x.user_id,x.first_at,CASE WHEN r.status='withdrawn' THEN 'withdrawn' ELSE 'active' END
 FROM abasong.access_records r CROSS JOIN LATERAL (
 SELECT u.user_id,min(u.first_at) AS first_at FROM (
 SELECT r.contributor_id AS user_id,r.contributed_at AS first_at
 UNION ALL SELECT e.user_id,e.occurred_at FROM abasong.access_contributions e
 WHERE e.record_id=r.id AND e.event_type IN ('created','same_value_validation')
 ) u GROUP BY u.user_id
 ) x ON CONFLICT(record_id,user_id) DO NOTHING;
ALTER TABLE abasong.access_contributions ADD COLUMN source_id uuid REFERENCES abasong.access_contribution_sources(id);
ALTER TABLE abasong.access_contributions ADD COLUMN source_version integer CHECK(source_version>0);
ALTER TABLE abasong.access_contributions ADD COLUMN replacement_source_id uuid REFERENCES abasong.access_contribution_sources(id);
UPDATE abasong.access_contributions e SET source_id=s.id,source_version=1
 FROM abasong.access_contribution_sources s WHERE s.record_id=e.record_id AND s.user_id=e.user_id;
ALTER TABLE abasong.access_contributions DROP CONSTRAINT access_contributions_event_type_check;
ALTER TABLE abasong.access_contributions ADD CONSTRAINT access_contributions_event_type_check
 CHECK(event_type IN ('created','same_value_validation','withdrawal_requested','withdrawn','corrected'));
CREATE INDEX contribution_sources_owner ON abasong.access_contribution_sources(user_id,first_contributed_at DESC,id DESC);
CREATE INDEX contribution_sources_active ON abasong.access_contribution_sources(record_id) WHERE status='active';
ALTER TABLE abasong.access_contribution_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.access_contribution_sources FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON abasong.access_contribution_sources TO abasong_sensitive;
CREATE POLICY source_metadata_read ON abasong.access_contribution_sources FOR SELECT TO abasong_sensitive USING(true);
CREATE POLICY source_owner_insert ON abasong.access_contribution_sources FOR INSERT TO abasong_sensitive
 WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY source_owner_update ON abasong.access_contribution_sources FOR UPDATE TO abasong_sensitive
 USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
-- Invoker security: ordinary service writes must still satisfy owner RLS.
CREATE FUNCTION abasong.initialize_access_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO abasong.access_contribution_sources(record_id,user_id,first_contributed_at,status)
 VALUES(NEW.id,NEW.contributor_id,NEW.contributed_at,CASE WHEN NEW.status='withdrawn' THEN 'withdrawn' ELSE 'active' END);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION abasong.initialize_access_source() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.initialize_access_source() TO abasong_sensitive;
CREATE TRIGGER initialize_access_source AFTER INSERT ON abasong.access_records
 FOR EACH ROW EXECUTE FUNCTION abasong.initialize_access_source();
INSERT INTO abasong.schema_version(version) VALUES('V12.0008');
COMMIT;
