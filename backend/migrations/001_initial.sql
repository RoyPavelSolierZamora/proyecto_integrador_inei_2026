CREATE SCHEMA IF NOT EXISTS epen;

CREATE TABLE IF NOT EXISTS epen.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epen.users (
  id bigserial PRIMARY KEY,
  username varchar(30) NOT NULL,
  full_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('analista', 'supervisor', 'auditor', 'admin')),
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9._-]{3,30}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
  ON epen.users (lower(username));
CREATE INDEX IF NOT EXISTS users_active_role_idx
  ON epen.users (active, role) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS epen.sessions (
  token_hash char(64) PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES epen.users(id) ON DELETE CASCADE,
  csrf_token char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON epen.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON epen.sessions (expires_at);

CREATE TABLE IF NOT EXISTS epen.datasets (
  id bigserial PRIMARY KEY,
  code varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  period varchar(40) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source_filename text,
  checksum_sha256 char(64),
  status varchar(20) NOT NULL DEFAULT 'staging' CHECK (status IN ('staging', 'active', 'archived', 'failed')),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  imported_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (name, period, version)
);

CREATE TABLE IF NOT EXISTS epen.survey_cases (
  id bigserial PRIMARY KEY,
  dataset_id bigint NOT NULL REFERENCES epen.datasets(id) ON DELETE RESTRICT,
  external_id varchar(120) NOT NULL,
  p309 text NOT NULL,
  p308 text,
  p308a text,
  candidates jsonb NOT NULL CHECK (CASE WHEN jsonb_typeof(candidates) = 'array' THEN jsonb_array_length(candidates) BETWEEN 1 AND 5 ELSE false END),
  confianza_ml numeric(6,5) CHECK (confianza_ml BETWEEN 0 AND 1),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'review', 'resolved', 'error')),
  final_code char(4) CHECK (final_code IS NULL OR final_code ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, external_id)
);

CREATE INDEX IF NOT EXISTS survey_cases_queue_idx ON epen.survey_cases (dataset_id, status);

CREATE TABLE IF NOT EXISTS epen.decisions (
  id bigserial PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES epen.survey_cases(id) ON DELETE RESTRICT,
  run_id varchar(100),
  source varchar(20) NOT NULL CHECK (source IN ('ml', 'llm', 'human')),
  decision varchar(30) NOT NULL,
  code char(4) CHECK (code IS NULL OR code ~ '^[0-9]{4}$'),
  justification text,
  model varchar(120),
  latency_seconds numeric(10,3),
  decided_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_case_idx ON epen.decisions (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_run_idx ON epen.decisions (run_id);

CREATE TABLE IF NOT EXISTS epen.audit_log (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  username varchar(30),
  action varchar(80) NOT NULL,
  entity_type varchar(50),
  entity_id varchar(120),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON epen.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON epen.audit_log (user_id, created_at DESC);

