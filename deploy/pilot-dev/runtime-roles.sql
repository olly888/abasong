-- Review material only. Apply ONLY to the explicitly authorized DevWest project.
-- All LOGIN credentials are separately provisioned via a protected admin session.
-- New roles have no password, hence are unusable until that step is approved.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'postgres' THEN RAISE EXCEPTION 'Unexpected cloud database'; END IF;
  IF NOT EXISTS(SELECT FROM abasong.schema_version WHERE version='V12.0009') THEN RAISE EXCEPTION 'Required migrations missing'; END IF;
  IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('abasong_api_dev','abasong_sensitive_dev','abasong_worker_dev')) THEN RAISE EXCEPTION 'Roles already exist; review current grants instead of replacing'; END IF;
END $$;
CREATE ROLE abasong_api_dev LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE abasong_sensitive_dev LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE abasong_worker_dev LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT abasong_api TO abasong_api_dev;
GRANT abasong_sensitive TO abasong_sensitive_dev;
GRANT abasong_worker TO abasong_worker_dev;
GRANT CONNECT ON DATABASE postgres TO abasong_api_dev,abasong_sensitive_dev,abasong_worker_dev;
ALTER ROLE abasong_api_dev SET search_path=pg_catalog,abasong,extensions;
ALTER ROLE abasong_sensitive_dev SET search_path=pg_catalog,abasong,extensions;
ALTER ROLE abasong_worker_dev SET search_path=pg_catalog,abasong,extensions;
ALTER ROLE abasong_api_dev SET statement_timeout='3s';
ALTER ROLE abasong_sensitive_dev SET statement_timeout='3s';
ALTER ROLE abasong_worker_dev SET statement_timeout='3s';
COMMIT;
