ALTER TABLE epen.processing_jobs
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS qwen_started_at timestamptz;

ALTER TABLE epen.datasets DROP CONSTRAINT IF EXISTS datasets_status_check;
ALTER TABLE epen.datasets
  ADD CONSTRAINT datasets_status_check
  CHECK (status IN ('staging', 'active', 'archived', 'failed', 'cancelled'));
