-- Owner removed standalone meeting sharing from the first release.
-- 0013 has already run locally: preserve its immutable history and all rows.
BEGIN;
REVOKE ALL ON abasong.meeting_share_secrets FROM abasong_sensitive;
REVOKE SELECT,INSERT,UPDATE ON abasong.meeting_shares FROM abasong_sensitive;
DROP POLICY secret_service ON abasong.meeting_share_secrets;
DROP POLICY meeting_service ON abasong.meeting_shares;
DROP POLICY meeting_notification ON abasong.notifications;
REVOKE INSERT ON abasong.notifications FROM abasong_sensitive;
INSERT INTO abasong.schema_version(version) VALUES('V12.0014');
COMMIT;
