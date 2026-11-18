-- Control de calidad con revisión ciega: cada revisión indica si fue un dictamen formal
-- (sobre la decisión visible) o una verificación ciega (el revisor no ve el código propuesto).
-- Las verificaciones ciegas miden la calidad y no cambian el código final del caso.
ALTER TABLE epen.quality_reviews
  ADD COLUMN IF NOT EXISTS method varchar(12) NOT NULL DEFAULT 'formal'
    CHECK (method IN ('formal', 'blind'));

CREATE INDEX IF NOT EXISTS quality_reviews_decision_idx
  ON epen.quality_reviews (decision_id, created_at DESC, id DESC);
