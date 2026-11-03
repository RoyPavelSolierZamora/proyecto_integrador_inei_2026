ALTER TABLE epen.processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_status_check;
ALTER TABLE epen.processing_jobs
  ADD CONSTRAINT processing_jobs_status_check
  CHECK (status IN ('queued', 'running', 'qwen_running', 'completed', 'failed', 'cancelled'));

ALTER TABLE epen.processing_jobs
  ADD COLUMN IF NOT EXISTS qwen_mode varchar(20) NOT NULL DEFAULT 'manual'
    CHECK (qwen_mode IN ('manual', 'automatic')),
  ADD COLUMN IF NOT EXISTS qwen_processed_count integer NOT NULL DEFAULT 0
    CHECK (qwen_processed_count >= 0),
  ADD COLUMN IF NOT EXISTS qwen_resolved_count integer NOT NULL DEFAULT 0
    CHECK (qwen_resolved_count >= 0),
  ADD COLUMN IF NOT EXISTS qwen_review_count integer NOT NULL DEFAULT 0
    CHECK (qwen_review_count >= 0);

