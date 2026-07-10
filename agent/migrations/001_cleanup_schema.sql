-- Phase 1: Database cleanup - remove unused columns, add continuity tracking
-- Date: 2025-01-10

-- Remove unused columns from scene
ALTER TABLE scene DROP COLUMN IF EXISTS dialog;
ALTER TABLE scene DROP COLUMN IF EXISTS slug;
ALTER TABLE scene DROP COLUMN IF EXISTS source_start;
ALTER TABLE scene DROP COLUMN IF EXISTS source_end;

-- Remove unused columns from entity
ALTER TABLE entity DROP COLUMN IF EXISTS ref_prompt;

-- Remove unused columns from shot
ALTER TABLE shot DROP COLUMN IF EXISTS part_idx;
ALTER TABLE shot DROP COLUMN IF EXISTS is_chained;

-- Add continuity tracking
ALTER TABLE scene ADD COLUMN IF NOT EXISTS exit_state TEXT;
-- exit_state = JSON: {present: [names], lighting: "warm golden", location: "Kitchen", props: [...]}

ALTER TABLE shot ADD COLUMN IF NOT EXISTS previous_shot_id UUID;
ALTER TABLE shot ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT 0;

-- Backfill: initialize exit_state as empty JSON for existing scenes
UPDATE scene SET exit_state = '{}' WHERE exit_state IS NULL;
