BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS focusguard;

CREATE TYPE organization_kind AS ENUM ('INDIVIDUAL', 'FAMILY', 'ORGANIZATION');
CREATE TYPE membership_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE enforcement_decision AS ENUM ('ALLOW', 'WARN', 'LIMIT', 'BLOCK', 'ESCALATE');

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    password_hash text NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'LOCKED', 'DELETED')),
    time_zone text NOT NULL DEFAULT 'UTC',
    policy_version bigint NOT NULL DEFAULT 1 CHECK (policy_version > 0),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE status <> 'DELETED';

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    kind organization_kind NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role membership_role NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memberships_active_unique
    ON organization_memberships (organization_id, user_id) WHERE status IN ('INVITED', 'ACTIVE');
CREATE INDEX memberships_user_idx ON organization_memberships (user_id, organization_id);

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    platform text NOT NULL,
    client_type text NOT NULL,
    client_version text NOT NULL,
    capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capabilities) = 'array'),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED', 'DELETED')),
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_owner_idx ON devices (organization_id, user_id);

CREATE TABLE schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL,
    time_zone text NOT NULL,
    windows jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'array'),
    valid_from timestamptz,
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE INDEX schedules_owner_idx ON schedules (organization_id, user_id);

CREATE TABLE policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    enabled boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 0,
    current_revision bigint NOT NULL DEFAULT 1 CHECK (current_revision > 0),
    fail_mode text NOT NULL DEFAULT 'OPEN' CHECK (fail_mode IN ('OPEN', 'CLOSED_FOR_CONFIGURED_TARGETS')),
    valid_from timestamptz,
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE INDEX policies_owner_idx ON policies (organization_id, user_id);

CREATE TABLE policy_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    priority integer NOT NULL DEFAULT 0,
    enabled boolean NOT NULL DEFAULT true,
    decision enforcement_decision NOT NULL,
    conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'object'),
    override_config jsonb NOT NULL CHECK (jsonb_typeof(override_config) = 'object'),
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 240),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policy_rules_policy_idx ON policy_rules (organization_id, policy_id, priority DESC);

CREATE TABLE policy_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    revision bigint NOT NULL CHECK (revision > 0),
    compiled_policy jsonb NOT NULL CHECK (jsonb_typeof(compiled_policy) = 'object'),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (policy_id, revision)
);
CREATE INDEX policy_revisions_owner_idx ON policy_revisions (organization_id, user_id, created_at DESC);

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((organization_id IS NULL AND user_id IS NULL) OR organization_id IS NOT NULL)
);

CREATE TABLE domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    normalized_domain text NOT NULL CHECK (
        char_length(normalized_domain) BETWEEN 1 AND 253
        AND normalized_domain = lower(normalized_domain)
        AND right(normalized_domain, 1) <> '.'
    ),
    source text NOT NULL,
    confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id, normalized_domain)
);

CREATE TABLE focus_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    state text NOT NULL CHECK (state IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE commitments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
    minimum_decision enforcement_decision NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    state text NOT NULL CHECK (state IN ('PENDING', 'ACTIVE', 'EXPIRED', 'RECOVERING', 'REVOKED')),
    recovery_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE accountability_partners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    partner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    partner_email text,
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
    status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (partner_user_id IS NOT NULL OR partner_email IS NOT NULL)
);

CREATE TABLE override_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    rule_id uuid REFERENCES policy_rules(id) ON DELETE SET NULL,
    commitment_id uuid REFERENCES commitments(id) ON DELETE SET NULL,
    level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
    reason text,
    state text NOT NULL CHECK (state IN ('PENDING', 'COOLDOWN', 'APPROVED', 'DENIED', 'EXPIRED', 'RECOVERING')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz,
    decided_at timestamptz,
    expires_at timestamptz,
    decision_actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE block_events (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    rule_id uuid REFERENCES policy_rules(id) ON DELETE SET NULL,
    decision enforcement_decision NOT NULL CHECK (decision <> 'ALLOW'),
    reason_code text NOT NULL,
    matched_configured_domain text NOT NULL,
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    snapshot_version bigint NOT NULL CHECK (snapshot_version > 0),
    client_version text NOT NULL,
    CHECK (matched_configured_domain !~ '[/\\?#@]')
);
CREATE INDEX block_events_owner_time_idx ON block_events (organization_id, user_id, received_at DESC);

CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    provider text NOT NULL,
    provider_customer_id text NOT NULL,
    provider_subscription_id text,
    state text NOT NULL,
    plan text NOT NULL,
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_customer_id)
);

CREATE TABLE device_health (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    observed_at timestamptz NOT NULL,
    policy_version bigint,
    sync_state text NOT NULL,
    enforcement_state text NOT NULL,
    clock_drift_bucket text,
    client_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_health_latest_idx ON device_health (organization_id, device_id, observed_at DESC);

CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_digest char(64) NOT NULL UNIQUE,
    csrf_digest char(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);

CREATE TABLE device_enrollment_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_digest char(64) NOT NULL UNIQUE,
    requested_name text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    family_id uuid NOT NULL,
    access_digest char(64) NOT NULL UNIQUE,
    access_expires_at timestamptz NOT NULL,
    refresh_digest char(64) NOT NULL UNIQUE,
    refresh_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by uuid REFERENCES device_credentials(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_proposals (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_text text NOT NULL CHECK (char_length(source_text) BETWEEN 1 AND 1000),
    proposed_policy jsonb NOT NULL,
    proposed_schedules jsonb NOT NULL,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    expires_at timestamptz NOT NULL,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_type text NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    result text NOT NULL,
    request_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX audit_events_owner_time_idx ON audit_events (organization_id, occurred_at DESC);

CREATE FUNCTION focusguard.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE FUNCTION focusguard.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Business and security-support tables are protected even from their owner. Authentication
-- entrypoints use narrowly scoped SECURITY DEFINER functions in a later production migration;
-- the application role does not receive unrestricted table grants.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'organizations', 'organization_memberships', 'devices', 'schedules', 'policies',
        'policy_rules', 'policy_revisions', 'domains', 'focus_sessions', 'commitments',
        'accountability_partners', 'override_requests', 'block_events', 'subscriptions',
        'device_health', 'user_sessions', 'device_enrollment_codes', 'device_credentials',
        'policy_proposals', 'audit_events'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    END LOOP;
END $$;

CREATE POLICY organizations_tenant ON organizations
    USING (id = focusguard.current_organization_id())
    WITH CHECK (id = focusguard.current_organization_id());

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'organization_memberships', 'devices', 'schedules', 'policies', 'policy_rules',
        'policy_revisions', 'domains', 'focus_sessions', 'commitments',
        'accountability_partners', 'override_requests', 'block_events', 'subscriptions',
        'device_health', 'user_sessions', 'device_enrollment_codes', 'device_credentials',
        'policy_proposals', 'audit_events'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY %I_tenant ON %I USING (organization_id = focusguard.current_organization_id()) WITH CHECK (organization_id = focusguard.current_organization_id())',
            table_name, table_name
        );
    END LOOP;
END $$;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
CREATE POLICY categories_visible ON categories
    USING (organization_id IS NULL OR organization_id = focusguard.current_organization_id())
    WITH CHECK (organization_id = focusguard.current_organization_id());

COMMIT;
