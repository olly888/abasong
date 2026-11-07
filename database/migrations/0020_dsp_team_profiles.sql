-- B5-02: one managed team per account, separately encrypted voluntary contact.
BEGIN;
ALTER TABLE abasong.organizations
 ADD COLUMN profile_managed boolean NOT NULL DEFAULT false,
 ADD COLUMN profile_version integer NOT NULL DEFAULT 0 CHECK(profile_version>=0),
 ADD COLUMN active boolean NOT NULL DEFAULT true,
 ADD COLUMN carriers text[] NOT NULL DEFAULT '{}' CHECK(cardinality(carriers)<=8),
 ADD COLUMN region_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(region_ids)<=5),
 ADD COLUMN contact_shared boolean NOT NULL DEFAULT false,
 ADD COLUMN legacy_name text,
 ADD COLUMN legacy_verification_status text,
 ADD CHECK(NOT contact_shared OR (profile_managed AND active));
CREATE UNIQUE INDEX organizations_managed_owner ON abasong.organizations(contact_user_id) WHERE profile_managed;
GRANT SELECT ON abasong.organizations TO abasong_sensitive;
GRANT INSERT(name,contact_user_id,profile_managed,profile_version,active,carriers,region_ids,contact_shared),
 UPDATE(name,profile_managed,profile_version,active,carriers,region_ids,contact_shared,legacy_name,legacy_verification_status,verification_status)
 ON abasong.organizations TO abasong_sensitive;
CREATE POLICY team_metadata_read ON abasong.organizations FOR SELECT TO abasong_sensitive USING(true);
CREATE POLICY team_metadata_insert ON abasong.organizations FOR INSERT TO abasong_sensitive
 WITH CHECK(contact_user_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY team_metadata_update ON abasong.organizations FOR UPDATE TO abasong_sensitive
 USING(contact_user_id::text=current_setting('abasong.actor_id',true))
 WITH CHECK(contact_user_id::text=current_setting('abasong.actor_id',true));
CREATE TABLE abasong.organization_contacts (
 organization_id uuid PRIMARY KEY REFERENCES abasong.organizations(id),
 payload jsonb NOT NULL CHECK((jsonb_typeof(payload)='object' AND payload->>'format' IN ('local-envelope-v1','aws-kms-envelope-v1')) IS TRUE)
);
ALTER TABLE abasong.organization_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.organization_contacts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON abasong.organization_contacts FROM PUBLIC,abasong_api,abasong_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.organization_contacts TO abasong_sensitive;
CREATE POLICY team_contact_owner ON abasong.organization_contacts TO abasong_sensitive
 USING(EXISTS(SELECT 1 FROM abasong.organizations o WHERE o.id=organization_id AND o.contact_user_id::text=current_setting('abasong.actor_id',true)))
 WITH CHECK(EXISTS(SELECT 1 FROM abasong.organizations o WHERE o.id=organization_id AND o.contact_user_id::text=current_setting('abasong.actor_id',true)));
CREATE POLICY team_contact_scoped ON abasong.organization_contacts FOR SELECT TO abasong_sensitive
 USING(organization_id::text=current_setting('abasong.team_contact_id',true) AND EXISTS(
  SELECT 1 FROM abasong.organizations o WHERE o.id=organization_id AND o.active AND o.contact_shared AND o.verification_status<>'rejected'));
CREATE FUNCTION abasong.keep_request_team() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status<>'draft' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
  RAISE EXCEPTION 'Published request team is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION abasong.keep_request_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.keep_request_team() TO abasong_api,abasong_worker;
CREATE TRIGGER keep_request_team BEFORE UPDATE ON abasong.requests FOR EACH ROW EXECUTE FUNCTION abasong.keep_request_team();
INSERT INTO abasong.schema_version(version) VALUES('V12.0020');
COMMIT;
