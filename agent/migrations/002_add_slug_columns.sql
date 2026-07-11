-- Add slug columns to character, location, prop tables
-- Slugs are immutable once assigned (deterministic from name)
-- Nullable to allow backfill phase

ALTER TABLE character ADD COLUMN slug TEXT;
ALTER TABLE location ADD COLUMN slug TEXT;
ALTER TABLE prop ADD COLUMN slug TEXT;

-- Unique indexes allow multiple NULL values (partial indexes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_slug ON character(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_slug ON location(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_slug ON prop(slug) WHERE slug IS NOT NULL;
