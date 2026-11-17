CREATE TABLE IF NOT EXISTS epen.catalog_change_requests (
  id bigserial PRIMARY KEY,
  request_type varchar(20) NOT NULL CHECK (request_type IN ('add', 'update', 'deactivate')),
  code char(4) NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  description text,
  justification text NOT NULL,
  source_reference text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by bigint NOT NULL REFERENCES epen.users(id) ON DELETE RESTRICT,
  reviewed_by bigint REFERENCES epen.users(id) ON DELETE SET NULL,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (request_type = 'deactivate' OR nullif(btrim(description), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS catalog_change_requests_status_idx
  ON epen.catalog_change_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_change_requests_pending_code_idx
  ON epen.catalog_change_requests (code) WHERE status = 'pending';

COMMENT ON TABLE epen.catalog_change_requests IS
  'Solicitudes auditables para modificar el catálogo; aprobar un código no reentrena el clasificador R2.';
