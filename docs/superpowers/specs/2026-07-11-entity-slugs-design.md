# Entity Slugs: Standardized Asset References for Beat Generation

**Date:** 2026-07-11  
**Status:** Design Phase  
**Scope:** Flow Kit asset extraction & beat generation pipeline

---

## Problem Statement

Beat generation currently produces unknown entities because:
1. Assets (characters, locations, props) are extracted with full names: `"Helene Kheler"`, `"Flower-Filled City"`
2. Beat prompt references different name variants: `"Helene"`, `"Ville fleurie"` (translated)
3. Validation fails → beats marked as "unknown" even though assets exist
4. AI hallucination isn't prevented by name mismatch alone

**Goal:** Ensure beats ONLY reference existing assets using standardized, immutable identifiers (slugs).

---

## Solution: Standardized Slugs

### Data Layer

**Schema changes:**
```sql
ALTER TABLE character ADD COLUMN slug TEXT UNIQUE NOT NULL;
ALTER TABLE location ADD COLUMN slug TEXT UNIQUE NOT NULL;
ALTER TABLE prop ADD COLUMN slug TEXT UNIQUE NOT NULL;
```

**Slug generation rule (deterministic):**
```
slug = lowercase(name)
       .remove_accents()
       .replace_spaces_and_dashes_with_underscores()
```

**Examples:**
- `"Helene Kheler"` → `helene_kheler`
- `"Flower-Filled City"` → `flower_filled_city`
- `"Chambre d'enfant"` → `chambre_d_enfant`
- `"Atelier d'art"` → `atelier_d_art`

**Invariant:** One name (full, complete) → One slug (immutable). Slugs never change once assigned.

### Beat Generation Flow

**1. Asset roster construction**
- Query character/location/prop by project_id
- SELECT: id, name, slug, description, type
- **Pass ONLY slugs to prompt** (not full names)

**2. Enhanced prompt**
```
AVAILABLE ENTITIES (use EXACTLY these — no variations, no new names):
- {helene_kheler} (character)
- {flower_filled_city} (location)
- {art_studio} (location)

FORBIDDEN: Do NOT invent new characters, locations, or props.
REQUIRED: Every entity in ref_entity_names MUST exactly match one of these slugs.
```

**3. Validation (strict)**
- Extract `ref_entity_names` from beat JSON
- Reject if ANY slug not in valid list
- Log which slugs failed
- Trigger retry (up to 2×) before fallback

**4. Retry on hallucination**
- If validation fails: `HTTPException(502, "Beats contain unknown entities. AI must use ONLY: [list of valid slugs]")`
- Caller retries with same prompt (AI sees strict error)
- After 2 retries: fallback to deterministic split (no slugs)

### Migration

**Phase 1: Schema**
```sql
ALTER TABLE character ADD COLUMN slug TEXT;
ALTER TABLE location ADD COLUMN slug TEXT;
ALTER TABLE prop ADD COLUMN slug TEXT;
```

**Phase 2: Backfill**
- Script: for each entity, calculate slug from name
- Insert into `slug` column
- After: add UNIQUE constraint

**Phase 3: Data integrity**
- No duplicates allowed (UNIQUE constraint)
- If collision detected during backfill → append numeric suffix (rare edge case)

### Code Changes

**brain.py (`unified_scene_beats_prompt`)**
- Change roster construction to use slugs only:
  ```python
  roster = "\n".join([
      f"- {{{e['slug']}}} ({e['type']}): {e.get('description', '')}"
      for e in entities
  ])
  ```
- Update prompt to emphasize slug-only requirement

**studio.py (`build_scene_beats`)**
- No change to querying (still SELECT name, slug)
- Roster uses slugs (handled by brain.py)
- Validation unchanged (already strict)

**validation.py (`auto_fix_beats`)**
- No change needed (already rejects hallucinations)

### Error Handling

**Beat validation fails:**
```
HTTPException(502): "Beats contain unknown entities: {hallucinated_slugs}. 
AI must use ONLY: {valid_slugs list}. Retrying..."
```

**After 2 retries:**
- Fallback to deterministic split (no slug references)
- Log warning: "Beat generation exhausted retries, using deterministic fallback"
- Scene completes with generic shots (no AI-generated refs)

---

## Testing Strategy

**Unit tests:**
1. Slug generation (deterministic, no collisions)
2. Roster construction (slugs only, no names)
3. Validation (rejects unknown slugs, accepts known ones)

**Integration tests:**
1. Extract assets → generate slugs → beat generation → validation passes
2. Beat references wrong slug → validation rejects → retry → success
3. All retries fail → fallback to deterministic split

**Manual test:**
- Project with 2 characters, 4 locations
- Generate beats → verify all ref_entity_names use correct slugs
- Manually break a ref_entity_name → watch validation reject and retry

---

## Rollout

**Phase 1:** Schema migration + backfill (non-breaking, slugs nullable initially)  
**Phase 2:** Code changes (prompt + validation)  
**Phase 3:** Add UNIQUE constraint to slug columns  
**Phase 4:** Monitor for edge cases (collisions, hallucinations)

---

## Open Questions / Edge Cases

1. **Slug collisions during backfill:** If two entities produce the same slug (very rare), append `_1`, `_2`, etc. during migration. Log all collisions for review.
2. **Changing entity names:** If user renames an entity, do we regenerate the slug? Decision: NO. Slug is immutable once set. Changing name = risk breaking beats. Require explicit slug change if needed (admin only).
3. **Old beats with name-based refs:** If beats were generated before slug migration, re-generate them to use slugs.

---

## Success Criteria

✅ Beats never reference unknown entities  
✅ Validation rejects hallucinated slugs immediately  
✅ Retry loop re-prompts AI on validation failure  
✅ All existing projects migrate without data loss  
✅ Slugs remain stable across renames (immutable)
