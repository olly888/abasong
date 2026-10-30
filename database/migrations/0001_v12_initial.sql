-- Abasong V12 initial schema. Fresh, isolated PostgreSQL database only.
-- Requires migration-owner privileges to create roles/extensions. Not auto-applied.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
DO $$ BEGIN
 IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis') <> 'extensions' THEN
   RAISE EXCEPTION 'PostGIS must be installed in extensions; review existing project before migration';
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='abasong_api') THEN CREATE ROLE abasong_api NOLOGIN NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='abasong_sensitive') THEN CREATE ROLE abasong_sensitive NOLOGIN NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='abasong_worker') THEN CREATE ROLE abasong_worker NOLOGIN NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA abasong;
REVOKE ALL ON SCHEMA abasong FROM PUBLIC;
GRANT USAGE ON SCHEMA abasong, extensions TO abasong_api,abasong_sensitive,abasong_worker;
CREATE TABLE abasong.schema_version(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO abasong.schema_version(version) VALUES ('V12.0001');
CREATE TABLE abasong.users (
 id uuid PRIMARY KEY, -- Supabase Auth sub; external auth DB FK intentionally omitted
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleting','deleted')),
 session_invalid_before timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE abasong.profiles (
 user_id uuid PRIMARY KEY REFERENCES abasong.users(id), display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60),
 bio text CHECK(length(bio)<=500), vehicle_type text,
 experience jsonb NOT NULL DEFAULT '[]', -- self-reported; verified claims stored separately
 timezone text NOT NULL DEFAULT 'America/Los_Angeles', locale text NOT NULL DEFAULT 'zh-CN',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.capabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES abasong.users(id),
 capability text NOT NULL CHECK(capability IN ('access.read','access.contribute','request.publish','request.apply','ops.review','ops.reveal','ops.user_manage')),
 granted_by uuid REFERENCES abasong.users(id), valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz,
 revoked_at timestamptz, reason text NOT NULL, CHECK(valid_until IS NULL OR valid_until>valid_from)
);
CREATE INDEX capabilities_lookup ON abasong.capabilities(user_id,capability) WHERE revoked_at IS NULL;
CREATE TABLE abasong.experience_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES abasong.users(id), carrier text NOT NULL,
 region_label text NOT NULL, description text NOT NULL, verified_by uuid NOT NULL REFERENCES abasong.users(id),
 valid_until timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 contact_user_id uuid NOT NULL REFERENCES abasong.users(id), verification_status text NOT NULL DEFAULT 'self_reported' CHECK(verification_status IN ('self_reported','verified','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.regions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL, timezone text NOT NULL DEFAULT 'America/Los_Angeles',
 boundary extensions.geometry(MultiPolygon,4326), display_point extensions.geography(Point,4326),
 CHECK(boundary IS NOT NULL OR display_point IS NOT NULL)
);
CREATE INDEX regions_boundary ON abasong.regions USING gist(boundary);
CREATE TABLE abasong.data_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_type text NOT NULL CHECK(source_type IN ('own_field','authorized_contribution','provider_permanent','licensed_dataset')),
 provider text, product text, license_reference text NOT NULL, persistent_use_approved boolean NOT NULL DEFAULT false,
 verified_at timestamptz, expires_at timestamptz,
 CHECK(persistent_use_approved) -- never store temporary Search Box/Geocoding responses here
);
CREATE TABLE abasong.apartments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES abasong.apartments(id),
 name text, address_line1 text NOT NULL, city text NOT NULL, state text NOT NULL DEFAULT 'CA', postal_code text,
 point extensions.geography(Point,4326) NOT NULL, boundary extensions.geometry(MultiPolygon,4326),
 source_id uuid NOT NULL REFERENCES abasong.data_sources(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','merged','withdrawn')),
 merged_into_id uuid REFERENCES abasong.apartments(id), confidence text NOT NULL DEFAULT 'unverified' CHECK(confidence IN ('unverified','field_verified','authorized_source')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(parent_id IS NULL OR parent_id<>id), CHECK(merged_into_id IS NULL OR merged_into_id<>id),
 CHECK((status='merged')=(merged_into_id IS NOT NULL))
);
CREATE INDEX apartments_point ON abasong.apartments USING gist(point);
CREATE INDEX apartments_boundary ON abasong.apartments USING gist(boundary);
CREATE TABLE abasong.apartment_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), apartment_id uuid NOT NULL REFERENCES abasong.apartments(id), alias text NOT NULL,
 UNIQUE(apartment_id,alias)
);
CREATE TABLE abasong.access_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), apartment_id uuid NOT NULL REFERENCES abasong.apartments(id),
 contributor_id uuid NOT NULL REFERENCES abasong.users(id), method text NOT NULL CHECK(method IN ('keypad','front_desk','digital_access','no_fixed_code','other')),
 scope_key text NOT NULL, scope_label text, applicable_schedule jsonb, -- canonical scope key generated server-side
 dedup_hmac bytea NOT NULL CHECK(octet_length(dedup_hmac)=32), hmac_key_version text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','review','invalid','withdrawn')),
 source_attested_at timestamptz NOT NULL, contributed_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz, last_failure_at timestamptz, expires_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(apartment_id,scope_key,hmac_key_version,dedup_hmac)
);
CREATE INDEX access_records_order ON abasong.access_records(apartment_id,contributed_at DESC,id DESC);
CREATE TABLE abasong.access_secrets (
 record_id uuid PRIMARY KEY REFERENCES abasong.access_records(id),
 ciphertext bytea NOT NULL, nonce bytea NOT NULL CHECK(octet_length(nonce)=12), auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16),
 encrypted_dek bytea NOT NULL, kms_key_id text NOT NULL, cipher_version text NOT NULL DEFAULT 'aes-256-gcm-v1'
);
CREATE TABLE abasong.access_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES abasong.access_records(id), user_id uuid NOT NULL REFERENCES abasong.users(id),
 event_type text NOT NULL CHECK(event_type IN ('created','same_value_validation','withdrawal_requested')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.access_feedback (
 record_id uuid NOT NULL REFERENCES abasong.access_records(id), user_id uuid NOT NULL REFERENCES abasong.users(id),
 value text NOT NULL CHECK(value IN ('useful','not_useful','withdrawn')),
 reason text CHECK(length(reason)<=200), applicable boolean NOT NULL DEFAULT true, excluded_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,user_id)
);
CREATE INDEX access_feedback_positive ON abasong.access_feedback(record_id,updated_at DESC) WHERE value='useful' AND excluded_at IS NULL AND applicable;
CREATE TABLE abasong.feedback_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES abasong.access_records(id), user_id uuid NOT NULL REFERENCES abasong.users(id),
 client_event_id uuid NOT NULL, value text NOT NULL CHECK(value IN ('useful','not_useful','withdrawn')), reason text, occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,client_event_id)
);
CREATE TABLE abasong.location_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES abasong.users(id), apartment_id uuid REFERENCES abasong.apartments(id),
 proposed_address text, reason text NOT NULL CHECK(length(reason)<=500), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
); -- no personal GPS trace retained
CREATE TABLE abasong.availability (
 user_id uuid PRIMARY KEY REFERENCES abasong.users(id), enabled boolean NOT NULL DEFAULT false,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, capacity_parcels integer CHECK(capacity_parcels>0),
 latest_finish_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(ends_at>starts_at), CHECK(latest_finish_at IS NULL OR latest_finish_at>=starts_at)
);
CREATE TABLE abasong.availability_regions (
 user_id uuid NOT NULL REFERENCES abasong.availability(user_id), region_id uuid NOT NULL REFERENCES abasong.regions(id), PRIMARY KEY(user_id,region_id)
);
CREATE TABLE abasong.requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publisher_id uuid NOT NULL REFERENCES abasong.users(id), organization_id uuid REFERENCES abasong.organizations(id),
 kind text NOT NULL CHECK(kind IN ('partial_route','whole_route','extra_drivers','vehicle_help','other_help')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','found','closed','expired')),
 region_id uuid REFERENCES abasong.regions(id), pickup_region_id uuid REFERENCES abasong.regions(id), pickup_area text, carrier text, route_label text, description text CHECK(length(description)<=1000),
 starts_at timestamptz, pickup_deadline_at timestamptz, delivery_deadline_at timestamptz, expires_at timestamptz,
 timezone text NOT NULL DEFAULT 'America/Los_Angeles', parcel_count integer CHECK(parcel_count>0), stop_count integer CHECK(stop_count>0),
 drivers_needed integer CHECK(drivers_needed>0), remaining_parcels integer CHECK(remaining_parcels>=0), remaining_drivers integer CHECK(remaining_drivers>=0),
 price_cents integer CHECK(price_cents>=0), price_unit text CHECK(price_unit IN ('per_parcel','per_route','negotiable')), currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 sorted_state text CHECK(sorted_state IN ('sorted','unsorted','unknown')), handoff_requirement text CHECK(handoff_requirement IN ('carrier_account','dsp_approval','contact_confirm')),
 private_payment_terms text CHECK(length(private_payment_terms)<=300), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 accepts_partial boolean NOT NULL DEFAULT true, minimum_parcels integer CHECK(minimum_parcels>0),
 experience_requirement text NOT NULL DEFAULT 'any' CHECK(experience_requirement IN ('any','delivery_experience','carrier_experience')), discarded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(remaining_parcels IS NULL OR (parcel_count IS NOT NULL AND remaining_parcels<=parcel_count)),
 CHECK(remaining_drivers IS NULL OR (drivers_needed IS NOT NULL AND remaining_drivers<=drivers_needed)),
 CHECK(price_unit IS NULL OR price_unit='negotiable' OR price_cents IS NOT NULL),
 CHECK(status='draft' OR (region_id IS NOT NULL AND starts_at IS NOT NULL AND expires_at IS NOT NULL)),
 CHECK(status='draft' OR kind IN ('vehicle_help','other_help') OR (carrier IS NOT NULL AND pickup_region_id IS NOT NULL AND pickup_area IS NOT NULL AND price_unit IS NOT NULL AND sorted_state IS NOT NULL AND handoff_requirement IS NOT NULL AND parcel_count IS NOT NULL)),
 CHECK(minimum_parcels IS NULL OR parcel_count IS NULL OR minimum_parcels<=parcel_count),
 CHECK(status='draft' OR kind<>'whole_route' OR (NOT accepts_partial AND minimum_parcels IS NOT NULL AND minimum_parcels=parcel_count)),
 CHECK(status='draft' OR kind<>'extra_drivers' OR drivers_needed IS NOT NULL),
 CHECK(expires_at IS NULL OR expires_at>created_at)
);
CREATE INDEX requests_open_region ON abasong.requests(region_id,expires_at) WHERE status='open';
CREATE TABLE abasong.request_private_details (
 request_id uuid PRIMARY KEY REFERENCES abasong.requests(id), ciphertext bytea NOT NULL, nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
 auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16), encrypted_dek bytea NOT NULL, kms_key_id text NOT NULL
); -- exact meeting point/contact, only explicitly shared with selected conversation participants
CREATE TABLE abasong.request_versions (
 request_id uuid NOT NULL REFERENCES abasong.requests(id), version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES abasong.users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(request_id,version)
); -- DTO allowlist strips exact meeting point/secret/contact
CREATE TABLE abasong.request_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES abasong.requests(id),
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES abasong.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at>created_at)
); -- public-summary-only capability, never a business JWT; redact token from logs
CREATE TABLE abasong.applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES abasong.requests(id), applicant_id uuid NOT NULL REFERENCES abasong.users(id),
 status text NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','withdrawn')), contacted_at timestamptz,
 expected_arrival_at timestamptz NOT NULL, capacity_parcels integer CHECK(capacity_parcels>0), observed_request_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,applicant_id),
 FOREIGN KEY(request_id,observed_request_version) REFERENCES abasong.request_versions(request_id,version)
);
CREATE TABLE abasong.application_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES abasong.applications(id), actor_id uuid NOT NULL REFERENCES abasong.users(id),
 event_type text NOT NULL CHECK(event_type IN ('applied','withdrawn','contacted')), occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.blocks (
 blocker_id uuid NOT NULL REFERENCES abasong.users(id), blocked_id uuid NOT NULL REFERENCES abasong.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE TABLE abasong.conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pair_low uuid NOT NULL REFERENCES abasong.users(id), pair_high uuid NOT NULL REFERENCES abasong.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(pair_low,pair_high), CHECK(pair_low<pair_high)
);
CREATE TABLE abasong.conversation_sources (
 conversation_id uuid NOT NULL REFERENCES abasong.conversations(id), request_id uuid NOT NULL, request_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,request_id,request_version),
 FOREIGN KEY(request_id,request_version) REFERENCES abasong.request_versions(request_id,version)
);
CREATE TABLE abasong.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 conversation_id uuid NOT NULL REFERENCES abasong.conversations(id), sender_id uuid NOT NULL REFERENCES abasong.users(id),
 client_message_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('text','request_card')),
 source_request_id uuid, source_request_version integer, created_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
 UNIQUE(sender_id,client_message_id),
 FOREIGN KEY(source_request_id,source_request_version) REFERENCES abasong.request_versions(request_id,version),
 CHECK((kind='text' AND source_request_id IS NULL AND source_request_version IS NULL) OR (kind='request_card' AND source_request_id IS NOT NULL AND source_request_version IS NOT NULL))
);
CREATE INDEX messages_sync ON abasong.messages(conversation_id,sequence);
CREATE TABLE abasong.message_secrets (
 message_id uuid PRIMARY KEY REFERENCES abasong.messages(id), ciphertext bytea NOT NULL, nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
 auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16), encrypted_dek bytea NOT NULL, kms_key_id text NOT NULL
);
CREATE TABLE abasong.conversation_reads (
 conversation_id uuid NOT NULL REFERENCES abasong.conversations(id), user_id uuid NOT NULL REFERENCES abasong.users(id),
 last_read_sequence bigint NOT NULL DEFAULT 0 CHECK(last_read_sequence>=0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id)
); -- application checks participant and sequence belongs to conversation
CREATE TABLE abasong.meeting_shares (
 request_id uuid NOT NULL REFERENCES abasong.requests(id), conversation_id uuid NOT NULL REFERENCES abasong.conversations(id),
 granted_by uuid NOT NULL REFERENCES abasong.users(id), revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(request_id,conversation_id)
);
CREATE TABLE abasong.contacts (
 owner_id uuid NOT NULL REFERENCES abasong.users(id), contact_id uuid NOT NULL REFERENCES abasong.users(id), private_note text CHECK(length(private_note)<=300),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,contact_id), CHECK(owner_id<>contact_id)
);
CREATE TABLE abasong.posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES abasong.users(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 request_id uuid REFERENCES abasong.requests(id), status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','review','removed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed ON abasong.posts(created_at DESC,id DESC) WHERE status='visible';
CREATE TABLE abasong.comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES abasong.posts(id), author_id uuid NOT NULL REFERENCES abasong.users(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000), status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','review','removed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES abasong.users(id), event_key text NOT NULL,
 kind text NOT NULL, object_type text NOT NULL, object_id uuid NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,event_key)
); -- no secret body; read business object with current permissions
CREATE INDEX notifications_unread ON abasong.notifications(user_id,created_at DESC) WHERE read_at IS NULL;
CREATE TABLE abasong.notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES abasong.users(id), chat_push boolean NOT NULL DEFAULT true, request_push boolean NOT NULL DEFAULT true, system_push boolean NOT NULL DEFAULT true
);
CREATE TABLE abasong.devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES abasong.users(id), installation_id uuid NOT NULL UNIQUE,
 push_token text, platform text NOT NULL CHECK(platform IN ('ios','android')), enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
); -- logout unbinds; token ownership transferred only after authenticated registration
CREATE TABLE abasong.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE, event_type text NOT NULL,
 object_id uuid NOT NULL, actor_id uuid REFERENCES abasong.users(id), payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
); -- allowlist IDs and version only; never plaintext password/message/location
CREATE INDEX outbox_pending ON abasong.outbox(available_at,created_at) WHERE status IN ('pending','processing');
CREATE TABLE abasong.push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES abasong.outbox(id), device_id uuid NOT NULL REFERENCES abasong.devices(id),
 ticket_id text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','provider_delivered','failed','dead')),
 receipt_checked_at timestamptz, error_code text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(outbox_id,device_id)
);
CREATE TABLE abasong.idempotency_keys (
 actor_id uuid NOT NULL REFERENCES abasong.users(id), route text NOT NULL, key uuid NOT NULL,
 request_hmac bytea NOT NULL, status text NOT NULL CHECK(status IN ('processing','completed')), response_status integer, response_object_id uuid,
 expires_at timestamptz NOT NULL, PRIMARY KEY(actor_id,route,key)
); -- replay references current object; do not cache plaintext response bodies
CREATE TABLE abasong.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES abasong.users(id),
 object_type text NOT NULL CHECK(object_type IN ('apartment','access_record','request','user','post','comment','message')),
 object_id uuid NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')), created_at timestamptz NOT NULL DEFAULT now()
); -- target type/id validation enforced by API; polymorphic FK cannot be automatic
CREATE TABLE abasong.moderation_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES abasong.users(id), report_id uuid REFERENCES abasong.reports(id),
 object_type text NOT NULL, object_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abasong.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES abasong.users(id), request_id uuid,
 action text NOT NULL, object_type text NOT NULL, object_id uuid, result text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
); -- metadata only; no bodies, credentials, phone, exact GPS
CREATE TABLE abasong.deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES abasong.users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_code text
);
CREATE UNIQUE INDEX one_live_deletion_job ON abasong.deletion_jobs(user_id) WHERE status IN ('pending','processing');
CREATE TABLE abasong.config_versions (
 version integer PRIMARY KEY CHECK(version>0), config jsonb NOT NULL, activated_at timestamptz,
 approved_by uuid REFERENCES abasong.users(id), created_at timestamptz NOT NULL DEFAULT now()
); -- feedback window/matching thresholds must be explicitly frozen, no invented production defaults

-- Server-side trusted DB roles only. These policies do NOT implement per-user authorization.
-- API guards/object predicates are mandatory. No business schema is exposed via PostgREST.
DO $$ DECLARE t record; role_name text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='abasong' LOOP
  EXECUTE format('ALTER TABLE abasong.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('ALTER TABLE abasong.%I FORCE ROW LEVEL SECURITY',t.tablename);
  IF t.tablename NOT IN ('access_secrets','message_secrets','request_private_details') THEN
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON abasong.%I TO abasong_api',t.tablename);
   EXECUTE format('CREATE POLICY server_api ON abasong.%I TO abasong_api USING (true) WITH CHECK (true)',t.tablename);
  ELSE
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON abasong.%I TO abasong_sensitive',t.tablename);
   EXECUTE format('CREATE POLICY sensitive_service ON abasong.%I TO abasong_sensitive USING (true) WITH CHECK (true)',t.tablename);
  END IF;
 END LOOP;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA abasong FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA abasong FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA abasong FROM %I',role_name);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA abasong TO abasong_api;
-- Append-only evidence: API may insert/read but not rewrite or delete history.
REVOKE UPDATE,DELETE ON abasong.feedback_events,abasong.request_versions,abasong.application_events,abasong.access_contributions,abasong.moderation_actions,abasong.audit_events FROM abasong_api;
REVOKE INSERT,UPDATE,DELETE ON abasong.schema_version,abasong.config_versions FROM abasong_api;
-- Worker least privilege to scheduling and delivery metadata; no encrypted payload access.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['outbox','notifications','devices','push_deliveries','requests','availability','deletion_jobs','users'] LOOP
  EXECUTE format('GRANT SELECT,UPDATE ON abasong.%I TO abasong_worker',name);
  EXECUTE format('CREATE POLICY server_worker ON abasong.%I TO abasong_worker USING(true) WITH CHECK(true)',name);
 END LOOP;
END $$;
GRANT INSERT ON abasong.notifications,abasong.push_deliveries,abasong.audit_events TO abasong_worker;
CREATE POLICY worker_audit ON abasong.audit_events FOR INSERT TO abasong_worker WITH CHECK(true);
REVOKE ALL ON ALL TABLES IN SCHEMA abasong FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA abasong FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA abasong REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA abasong REVOKE ALL ON SEQUENCES FROM PUBLIC;
COMMIT;
