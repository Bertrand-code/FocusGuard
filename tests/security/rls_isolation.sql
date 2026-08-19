\set ON_ERROR_STOP on

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'focusguard_rls_test') THEN
        EXECUTE 'DROP OWNED BY focusguard_rls_test';
        EXECUTE 'DROP ROLE focusguard_rls_test';
    END IF;
END $$;
DELETE FROM organizations WHERE id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

INSERT INTO organizations (id, name, kind) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Tenant A', 'INDIVIDUAL'),
  ('10000000-0000-4000-8000-000000000002', 'Tenant B', 'INDIVIDUAL');

CREATE ROLE focusguard_rls_test NOLOGIN;
GRANT USAGE ON SCHEMA public, focusguard TO focusguard_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, policies TO focusguard_rls_test;

SET ROLE focusguard_rls_test;
BEGIN;
SET LOCAL app.organization_id = '10000000-0000-4000-8000-000000000001';
SELECT 1 / CASE WHEN count(*) = 1 THEN 1 ELSE 0 END FROM organizations;
SELECT 1 / CASE WHEN bool_and(id = '10000000-0000-4000-8000-000000000001') THEN 1 ELSE 0 END FROM organizations;
ROLLBACK;
RESET ROLE;

DROP OWNED BY focusguard_rls_test;
DROP ROLE focusguard_rls_test;
DELETE FROM organizations WHERE id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);
