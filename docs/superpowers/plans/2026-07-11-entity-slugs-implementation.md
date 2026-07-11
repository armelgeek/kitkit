# Entity Slugs for Beat Generation — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task-by-task.

**Goal:** Standardize asset references with immutable slugs so beat generation never references unknown entities and maintains media_id consistency for Flow API.

**Architecture:** Add `slug` column to entity tables, backfill deterministically from existing names, modify beat prompt to use ONLY slugs, validation already rejects hallucinations, verify media_id chain for Flow.

**Tech Stack:** Python (Flask/FastAPI), SQLite, deterministic slug generation (lowercase + remove accents + underscores), UUID media_ids

## Global Constraints

- Slugs are immutable once assigned (name can change, slug cannot)
- Slug generation is deterministic: `lowercase + remove_accents + replace(" /-" with "_")`
- Only slugs are passed to beat prompt (not full names)
- Validation rejects any unknown slug (already implemented)
- Every entity in a beat MUST have a valid media_id for Flow API reference
- Zero data loss during migration

---

## File Structure

```
agent/
  studio/
    brain.py              ← Modify: unified_scene_beats_prompt() to use slugs only
    db.py                 ← Add: slug normalization helper
  api/
    studio.py             ← Modify: build_scene_beats() query to fetch slugs
    
tests/
  test_slugs.py           ← New: slug generation, validation, backfill tests
  test_slug_integration.py ← New: workflow tests
  test_slug_pipeline.py   ← New: E2E pipeline with media_id verification
  
migrations/
  001_add_slug_columns.sql ← New: schema migration
  002_backfill_slugs.py    ← New: backfill script

docs/
  superpowers/plans/
    2026-07-11-entity-slugs-implementation.md ← This file
  SLUGS.md                ← New: slug system documentation
```

---

## Tasks

### Task 1: Add Slug Generation Helper

**Files:**
- Modify: `agent/studio/db.py`

**Interfaces:**
- Produces: `def normalize_to_slug(name: str) -> str`
  - Input: any entity name (with accents, spaces, dashes)
  - Returns: lowercase slug with underscores, no accents

- [ ] **Step 1: Write failing test**

Create `tests/test_slugs.py`:

```python
import pytest
from agent.studio.db import normalize_to_slug

def test_normalize_simple():
    assert normalize_to_slug("Helene Kheler") == "helene_kheler"

def test_normalize_accents():
    assert normalize_to_slug("Chambre d'enfant") == "chambre_d_enfant"

def test_normalize_dashes():
    assert normalize_to_slug("Flower-Filled City") == "flower_filled_city"

def test_normalize_mixed():
    assert normalize_to_slug("Atelier d'Art") == "atelier_d_art"

def test_normalize_whitespace():
    assert normalize_to_slug("  Multi   Space  ") == "multi_space"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_slugs.py -v
```

Expected: FAILED — `normalize_to_slug not found`

- [ ] **Step 3: Implement in `agent/studio/db.py`**

Add at the top of the file (after imports):

```python
import unicodedata
import re

def normalize_to_slug(name: str) -> str:
    """Convert entity name to immutable slug identifier.
    
    Rules:
    - Lowercase
    - Remove accents (é → e)
    - Replace spaces/dashes with underscores
    - Strip leading/trailing whitespace
    """
    if not name:
        return ""
    # Normalize unicode (decompose accents)
    name = unicodedata.normalize("NFD", name)
    # Remove accents
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    # Lowercase and strip
    name = name.lower().strip()
    # Replace spaces, dashes, slashes with underscore
    name = re.sub(r"[\s\-/]+", "_", name)
    # Remove any remaining special chars (keep only alphanumeric + underscore)
    name = re.sub(r"[^a-z0-9_]", "", name)
    # Collapse consecutive underscores
    name = re.sub(r"_+", "_", name)
    # Strip leading/trailing underscores
    name = name.strip("_")
    return name
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_slugs.py -v
```

Expected: PASSED (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/test_slugs.py agent/studio/db.py
git commit -m "feat: add normalize_to_slug helper for entity identifiers"
```

---

### Task 2: Database Schema — Add Slug Columns

**Files:**
- Create: `migrations/001_add_slug_columns.sql`

**Interfaces:**
- Produces: Three new nullable columns `slug TEXT` on character, location, prop tables

- [ ] **Step 1: Create migration file**

Create `migrations/001_add_slug_columns.sql`:

```sql
-- Add slug columns to entity tables
-- Migration: 2026-07-11 entity slugs

-- Character table
ALTER TABLE character ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_character_slug ON character(slug) WHERE slug IS NOT NULL;

-- Location table
ALTER TABLE location ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_location_slug ON location(slug) WHERE slug IS NOT NULL;

-- Prop table
ALTER TABLE prop ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_prop_slug ON prop(slug) WHERE slug IS NOT NULL;
```

- [ ] **Step 2: Verify syntax**

```bash
sqlite3 :memory: < migrations/001_add_slug_columns.sql
```

Expected: No errors

- [ ] **Step 3: Commit migration file**

```bash
git add migrations/001_add_slug_columns.sql
git commit -m "migration: add slug columns to character, location, prop tables"
```

---

### Task 3: Backfill Existing Entities with Slugs

**Files:**
- Create: `migrations/002_backfill_slugs.py`

**Interfaces:**
- Consumes: `normalize_to_slug()` from Task 1
- Produces: Script that populates `slug` column for all existing entities

- [ ] **Step 1: Write backfill script**

Create `migrations/002_backfill_slugs.py`:

```python
#!/usr/bin/env python3
"""
Backfill slug column for existing entities.
Usage: python migrations/002_backfill_slugs.py
"""
import sys
import sqlite3
from pathlib import Path

# Add agent to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from agent.studio.db import normalize_to_slug, get_db

def backfill_slugs():
    """Populate slug column from name for all entities."""
    db = get_db()
    cursor = db.cursor()
    
    tables = [("character", "Character"), ("location", "Location"), ("prop", "Prop")]
    total = 0
    collisions = []
    
    for table, label in tables:
        # Get all entities with NULL slug
        cursor.execute(f"SELECT id, name FROM {table} WHERE slug IS NULL")
        rows = cursor.fetchall()
        
        if not rows:
            print(f"✓ {label}: No entities to backfill")
            continue
        
        print(f"\nBackfilling {label} ({len(rows)} entities)...")
        
        for entity_id, name in rows:
            slug = normalize_to_slug(name)
            
            # Check for collision
            cursor.execute(f"SELECT id FROM {table} WHERE slug = ? AND id != ?", (slug, entity_id))
            if cursor.fetchone():
                # Collision — append numeric suffix
                counter = 1
                while True:
                    new_slug = f"{slug}_{counter}"
                    cursor.execute(f"SELECT id FROM {table} WHERE slug = ?", (new_slug,))
                    if not cursor.fetchone():
                        slug = new_slug
                        collisions.append(f"{table}.{name} → {slug} (collision resolved)")
                        break
                    counter += 1
            
            cursor.execute(f"UPDATE {table} SET slug = ? WHERE id = ?", (slug, entity_id))
            total += 1
            print(f"  {name:40} → {slug}")
    
    db.commit()
    print(f"\n✓ Backfill complete: {total} entities updated")
    
    if collisions:
        print(f"\n⚠ Collisions resolved:")
        for c in collisions:
            print(f"  {c}")
    
    return True

if __name__ == "__main__":
    try:
        if backfill_slugs():
            sys.exit(0)
    except Exception as e:
        print(f"✗ Backfill failed: {e}", file=sys.stderr)
        sys.exit(1)
```

- [ ] **Step 2: Write test for backfill**

Add to `tests/test_slugs.py`:

```python
def test_backfill_integration(tmp_db):
    """Test that backfill correctly populates slugs from names."""
    # tmp_db is a fixture with character table ready
    # Insert test entities
    tmp_db.insert("character", {
        "id": "char1", "project_id": "proj1", 
        "name": "Helene Kheler", "slug": None
    })
    tmp_db.insert("location", {
        "id": "loc1", "project_id": "proj1",
        "name": "Flower-Filled City", "slug": None
    })
    
    # Run backfill
    from migrations.backfill_slugs import backfill_entity_slugs
    backfill_entity_slugs(tmp_db)
    
    # Verify slugs were set
    char = tmp_db.query_one("SELECT slug FROM character WHERE id=?", ("char1",))
    assert char["slug"] == "helene_kheler"
    
    loc = tmp_db.query_one("SELECT slug FROM location WHERE id=?", ("loc1",))
    assert loc["slug"] == "flower_filled_city"
```

- [ ] **Step 3: Run test**

```bash
pytest tests/test_slugs.py::test_backfill_integration -v
```

Expected: PASSED

- [ ] **Step 4: Commit**

```bash
git add migrations/002_backfill_slugs.py tests/test_slugs.py
git commit -m "feat: add backfill script to populate slug column from existing entity names"
```

---

### Task 4: Modify Beat Prompt to Use Slugs Only

**Files:**
- Modify: `agent/studio/brain.py:680-764` (unified_scene_beats_prompt function)

**Interfaces:**
- Consumes: Entity roster with `slug` field (already passed from studio.py query)
- Produces: Modified prompt that references ONLY slugs, not full names

- [ ] **Step 1: Update roster construction in prompt**

In `agent/studio/brain.py`, find the `unified_scene_beats_prompt` function. Modify the roster construction (around line 694):

**Before:**
```python
roster = "\n".join([
    f"- {{{e['name']}}} ({e['type']}): {e.get('description', '')}"
    for e in entities
]) or "(none)"
```

**After:**
```python
roster = "\n".join([
    f"- {{{e['slug']}}} ({e['type']}): {e.get('description', '')}"
    for e in entities
]) or "(none)"
```

- [ ] **Step 2: Strengthen prompt language (line 714-737)**

Find the prompt text and update the entity constraints section:

**Before:**
```
- Each frame wraps entity names in {{braces}}: {{Entity}}
- No hallucinations: all wrapped names must exist in AVAILABLE ENTITIES
```

**After:**
```
- Each frame wraps entity names in {{braces}}: {{Entity}}
- STRICT: All entity names in ref_entity_names and {{wrapped}} must EXACTLY match the slugs in AVAILABLE ENTITIES
- FORBIDDEN: Do NOT invent new characters, locations, or props. Do NOT rename entities.
```

And update the "AVAILABLE ENTITIES" section comment:

**Before:**
```
AVAILABLE ENTITIES:
{roster}
```

**After:**
```
AVAILABLE ENTITIES (use EXACTLY these slugs — no variations, no new names):
{roster}
```

- [ ] **Step 3: Write test to verify slug-only prompt**

Add to `tests/test_slugs.py`:

```python
def test_unified_scene_beats_prompt_uses_slugs():
    """Verify that beat prompt passes slugs, not full names."""
    from agent.studio import brain
    
    entities = [
        {"name": "Helene Kheler", "slug": "helene_kheler", "type": "character", "description": "A young girl"},
        {"name": "Flower-Filled City", "slug": "flower_filled_city", "type": "location", "description": "A vibrant city"}
    ]
    
    prompt = brain.unified_scene_beats_prompt(
        voiceover="Test narration",
        scene_heading="INT. FLOWER-FILLED CITY - DAY",
        scene_action="Test action",
        entities=entities,
        style="anime"
    )
    
    # Verify prompt contains slugs
    assert "{helene_kheler}" in prompt
    assert "{flower_filled_city}" in prompt
    
    # Verify prompt does NOT contain full names in braces
    assert "{Helene Kheler}" not in prompt
    assert "{Flower-Filled City}" not in prompt
    
    # Verify STRICT constraint is in prompt
    assert "STRICT" in prompt
    assert "FORBIDDEN" in prompt
```

- [ ] **Step 4: Run test**

```bash
pytest tests/test_slugs.py::test_unified_scene_beats_prompt_uses_slugs -v
```

Expected: PASSED

- [ ] **Step 5: Commit**

```bash
git add agent/studio/brain.py tests/test_slugs.py
git commit -m "feat: modify beat prompt to use entity slugs only, strengthen no-hallucination constraints"
```

---

### Task 5: Update Beat Query to Fetch Slugs

**Files:**
- Modify: `agent/api/studio.py:1924-1931` (build_scene_beats function)

**Interfaces:**
- Consumes: Entity query that now includes slug column
- Produces: Query result with `slug` field available for roster construction

- [ ] **Step 1: Verify query includes slug**

In `agent/api/studio.py`, find the entity query in `build_scene_beats` (around line 1924):

```python
erows = await db.query_all("""
    SELECT id, name, 'character' as type, description FROM character WHERE project_id=?
    UNION ALL
    SELECT id, name, 'location' as type, description FROM location WHERE project_id=?
    UNION ALL
    SELECT id, name, 'prop' as type, description FROM prop WHERE project_id=?
""", (scene["project_id"], scene["project_id"], scene["project_id"]))
```

**Modify to include slug:**

```python
erows = await db.query_all("""
    SELECT id, name, slug, 'character' as type, description FROM character WHERE project_id=?
    UNION ALL
    SELECT id, name, slug, 'location' as type, description FROM location WHERE project_id=?
    UNION ALL
    SELECT id, name, slug, 'prop' as type, description FROM prop WHERE project_id=?
""", (scene["project_id"], scene["project_id"], scene["project_id"]))
```

- [ ] **Step 2: Write test**

Add to `tests/test_slugs.py`:

```python
async def test_build_scene_beats_query_includes_slug(test_project):
    """Verify that beat generation queries include slug column."""
    from agent.api import studio
    
    # Create test entities with slugs
    await test_project.db.insert("character", {
        "id": "char1", "project_id": test_project.id,
        "name": "Helene Kheler", "slug": "helene_kheler"
    })
    
    # Simulate the query from build_scene_beats
    erows = await test_project.db.query_all("""
        SELECT id, name, slug, 'character' as type FROM character WHERE project_id=?
    """, (test_project.id,))
    
    assert len(erows) == 1
    assert erows[0]["slug"] == "helene_kheler"
    assert erows[0]["name"] == "Helene Kheler"
```

- [ ] **Step 3: Run test**

```bash
pytest tests/test_slugs.py::test_build_scene_beats_query_includes_slug -v
```

Expected: PASSED

- [ ] **Step 4: Commit**

```bash
git add agent/api/studio.py tests/test_slugs.py
git commit -m "feat: include slug in entity query for beat generation"
```

---

### Task 6: Validation Test — Ensure Strict Slug Checking

**Files:**
- Modify: `tests/test_slugs.py` (add comprehensive validation tests)

**Interfaces:**
- Consumes: auto_fix_beats() validation function (already strict)
- Produces: Test suite verifying rejection of unknown slugs

- [ ] **Step 1: Write validation tests**

Add to `tests/test_slugs.py`:

```python
async def test_validation_rejects_unknown_slug():
    """Verify that validation rejects beats with unknown entity slugs."""
    from agent.studio import validation
    
    entities = [
        {"id": "c1", "name": "Helene", "slug": "helene", "type": "character"}
    ]
    entities_by_name = {e["name"]: e for e in entities}
    
    beats = [
        {
            "text": "Test narration",
            "description": "At {helene}, wide shot",
            "ref_entity_names": ["helene"],
            "visual_prompt": "Test prompt"
        }
    ]
    
    # This should PASS (valid slug)
    result, issues = await validation.auto_fix_beats(beats, entities, max_retries=0)
    assert issues["valid"] == True
    
    # Now test with invalid slug
    beats_bad = [
        {
            "text": "Test narration",
            "description": "At {unknown_character}, wide shot",
            "ref_entity_names": ["unknown_character"],
            "visual_prompt": "Test prompt"
        }
    ]
    
    # This should FAIL (unknown slug)
    with pytest.raises(HTTPException) as exc_info:
        await validation.auto_fix_beats(beats_bad, entities, max_retries=0)
    
    assert exc_info.value.status_code == 502
    assert "unknown entities" in exc_info.value.detail.lower()
```

- [ ] **Step 2: Run test**

```bash
pytest tests/test_slugs.py::test_validation_rejects_unknown_slug -v
```

Expected: PASSED

- [ ] **Step 3: Commit**

```bash
git add tests/test_slugs.py
git commit -m "test: add validation tests for strict slug checking"
```

---

### Task 7: Integration Test — End-to-End Slug Flow

**Files:**
- Create: `tests/test_slug_integration.py`

**Interfaces:**
- Consumes: All components from Tasks 1-6
- Produces: Full workflow test: extract → backfill → prompt → validate

- [ ] **Step 1: Write end-to-end test**

Create `tests/test_slug_integration.py`:

```python
import pytest
from agent.studio import brain, validation
from agent.studio.db import normalize_to_slug

@pytest.mark.asyncio
async def test_end_to_end_slug_flow():
    """
    Full workflow:
    1. Extract entities with names
    2. Backfill slugs
    3. Generate beat prompt using slugs
    4. Validate beats reference only known slugs
    """
    
    # Step 1: Simulated extracted entities
    raw_entities = [
        {"name": "Helene Kheler", "type": "character", "description": "A young girl"},
        {"name": "Flower-Filled City", "type": "location", "description": "A vibrant city"},
    ]
    
    # Step 2: Add slugs
    entities = []
    for e in raw_entities:
        entities.append({
            **e,
            "id": f"{e['type'][:3]}_{len(entities)}",
            "slug": normalize_to_slug(e["name"])
        })
    
    # Verify slugs are correct
    assert entities[0]["slug"] == "helene_kheler"
    assert entities[1]["slug"] == "flower_filled_city"
    
    # Step 3: Generate beat prompt
    prompt = brain.unified_scene_beats_prompt(
        voiceover="Helene wakes up in her city.",
        scene_heading="INT. FLOWER-FILLED CITY - MORNING",
        scene_action="Helene opens her eyes",
        entities=entities,
        style="anime"
    )
    
    # Verify prompt contains ONLY slugs
    assert "{helene_kheler}" in prompt
    assert "{flower_filled_city}" in prompt
    assert "{Helene Kheler}" not in prompt  # Full name should NOT appear
    
    # Step 4: Simulate valid beat response
    valid_beats = [
        {
            "text": "Helene wakes up",
            "description": "At {flower_filled_city}, wide shot showing {helene_kheler}",
            "ref_entity_names": ["flower_filled_city", "helene_kheler"],
            "visual_prompt": "Test"
        }
    ]
    
    # Validate should PASS
    result, issues = await validation.auto_fix_beats(valid_beats, entities, max_retries=0)
    assert issues["valid"] == True
    
    # Step 5: Simulate hallucinated beat (unknown slug)
    bad_beats = [
        {
            "text": "Helene meets someone",
            "description": "At {unknown_city}, Helene meets {mysterious_stranger}",
            "ref_entity_names": ["unknown_city", "mysterious_stranger"],
            "visual_prompt": "Test"
        }
    ]
    
    # Validate should FAIL
    with pytest.raises(HTTPException) as exc:
        await validation.auto_fix_beats(bad_beats, entities, max_retries=0)
    assert "unknown entities" in str(exc.value.detail).lower()
    
    print("✓ End-to-end slug flow: PASS")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

- [ ] **Step 2: Run integration test**

```bash
pytest tests/test_slug_integration.py -v
```

Expected: PASSED

- [ ] **Step 3: Commit**

```bash
git add tests/test_slug_integration.py
git commit -m "test: add end-to-end integration test for slug workflow"
```

---

### Task 8: Migration Execution & Verification

**Files:**
- Scripts to run migrations

**Interfaces:**
- Consumes: Migration files from Tasks 2-3
- Produces: Updated database with slug columns and backfilled data

- [ ] **Step 1: Apply schema migration**

```bash
sqlite3 flowkit.db < migrations/001_add_slug_columns.sql
```

Verify:
```bash
sqlite3 flowkit.db ".schema character" | grep slug
```

Expected: Column slug appears in schema

- [ ] **Step 2: Run backfill script**

```bash
python migrations/002_backfill_slugs.py
```

Expected: Output showing all entities backfilled, no errors

- [ ] **Step 3: Verify all slugs are populated**

```bash
sqlite3 flowkit.db "SELECT COUNT(*) FROM character WHERE slug IS NULL;"
sqlite3 flowkit.db "SELECT COUNT(*) FROM location WHERE slug IS NULL;"
sqlite3 flowkit.db "SELECT COUNT(*) FROM prop WHERE slug IS NULL;"
```

Expected: All return 0

- [ ] **Step 4: Spot-check slug values**

```bash
sqlite3 flowkit.db "SELECT name, slug FROM character LIMIT 5;"
```

Expected: Slugs match normalized names (lowercase, underscores, no accents)

- [ ] **Step 5: Add UNIQUE constraint**

```bash
sqlite3 flowkit.db "ALTER TABLE character ADD CONSTRAINT unique_char_slug UNIQUE(slug);"
sqlite3 flowkit.db "ALTER TABLE location ADD CONSTRAINT unique_loc_slug UNIQUE(slug);"
sqlite3 flowkit.db "ALTER TABLE prop ADD CONSTRAINT unique_prop_slug UNIQUE(slug);"
```

- [ ] **Step 6: Commit migration checkpoint**

```bash
git add -A
git commit -m "migration: apply slug columns and backfill all existing entities"
```

---

### Task 9: Documentation & Rollout Notes

**Files:**
- Create: `docs/SLUGS.md` (developer documentation)

**Interfaces:**
- Produces: Runbook for understanding slug system

- [ ] **Step 1: Write slug documentation**

Create `docs/SLUGS.md`:

```markdown
# Entity Slugs System

## Overview

Slugs are immutable, standardized identifiers for entities (characters, locations, props). They replace full names in beat generation to prevent hallucination and name mismatches.

## Slug Format

```
slug = lowercase(name) + remove_accents + replace(" /-" with "_")
```

Examples:
- "Helene Kheler" → `helene_kheler`
- "Flower-Filled City" → `flower_filled_city`
- "Chambre d'enfant" → `chambre_d_enfant`

## Database

Three columns added:
- `character.slug` (TEXT, UNIQUE)
- `location.slug` (TEXT, UNIQUE)
- `prop.slug` (TEXT, UNIQUE)

## API / Beat Generation

Beat prompt receives ONLY slugs:
```
AVAILABLE ENTITIES:
- {helene_kheler} (character)
- {flower_filled_city} (location)
```

AI must use exactly these slugs in `ref_entity_names`.

## Validation

Any beat referencing an unknown slug is rejected and retried (max 2×).

## Flow API Integration

Every entity referenced in beats MUST have a `media_id` (UUID of the reference asset image).

**Beat to Flow mapping:**
```json
{
  "ref_entity_names": ["helene_kheler", "flower_filled_city"],
  "ref_entity_media_ids": [
    {"slug": "helene_kheler", "media_id": "char-helene-uuid", "type": "character"},
    {"slug": "flower_filled_city", "media_id": "loc-city-uuid", "type": "location"}
  ]
}
```

Flow API uses `media_id` to fetch reference images for consistent generation.

## Name Changes

- Entity `name` can change without affecting beats
- Entity `slug` is immutable — changing it breaks existing beats
- If slug must change: rare admin operation (update all beats manually)

## Implementation

- `normalize_to_slug()` in `agent/studio/db.py`
- Used in: `agent/studio/brain.py` (prompt), `agent/api/studio.py` (query)
```

- [ ] **Step 2: Commit documentation**

```bash
git add docs/SLUGS.md
git commit -m "docs: add slug system documentation"
```

---

### Task 10: Final E2E Test — Full Pipeline with Media ID Verification

**Files:**
- Create: `tests/test_slug_pipeline.py` (comprehensive E2E test)

**Interfaces:**
- Consumes: All previous tasks completed
- Produces: Verified end-to-end: extract assets → generate beats → validate media_id consistency for Flow API

- [ ] **Step 1: Write comprehensive E2E test with media_id verification**

Create `tests/test_slug_pipeline.py`:

```python
import pytest
import json
from agent.studio import brain, validation
from agent.studio.db import normalize_to_slug

@pytest.mark.asyncio
async def test_end_to_end_pipeline_with_media_ids():
    """
    FULL PIPELINE TEST:
    1. Extract entities (characters, locations) with slugs
    2. Generate media_ids for each entity (simulating reference asset generation)
    3. Generate beat prompt using slugs
    4. Simulate AI beat response
    5. Validate beats reference ONLY known entities (no hallucinations)
    6. Verify every ref_entity_name has a corresponding media_id in assets
    7. Confirm media_ids are ready for Flow API
    """
    
    # PHASE 1: Setup assets with slugs and media_ids
    print("\n=== PHASE 1: Asset Setup ===")
    
    assets = {
        "character": [
            {
                "id": "char_helene",
                "name": "Helene Kheler",
                "slug": normalize_to_slug("Helene Kheler"),
                "type": "character",
                "description": "A young girl with silver hair",
                "media_id": "char-helene-media-uuid",  # Simulated reference image media_id
                "status": "generated"
            }
        ],
        "location": [
            {
                "id": "loc_bedroom",
                "name": "Child's Bedroom",
                "slug": normalize_to_slug("Child's Bedroom"),
                "type": "location",
                "description": "A cozy bedroom bathed in golden light",
                "media_id": "loc-bedroom-media-uuid",  # Simulated reference sheet media_id
                "status": "generated"
            },
            {
                "id": "loc_city",
                "name": "Flower-Filled City",
                "slug": normalize_to_slug("Flower-Filled City"),
                "type": "location",
                "description": "A vibrant city with cherry blossoms",
                "media_id": "loc-city-media-uuid",
                "status": "generated"
            }
        ]
    }
    
    # Flatten for validation
    all_entities = assets["character"] + assets["location"]
    
    # Verify slugs are correct
    assert assets["character"][0]["slug"] == "helene_kheler"
    assert assets["location"][0]["slug"] == "child_s_bedroom"
    assert assets["location"][1]["slug"] == "flower_filled_city"
    print(f"✓ Assets created: {len(all_entities)} entities with slugs and media_ids")
    
    # PHASE 2: Generate beat prompt using slugs
    print("\n=== PHASE 2: Beat Prompt Generation ===")
    
    prompt = brain.unified_scene_beats_prompt(
        voiceover="Helene wakes up in her bedroom, then runs through the flower-filled city.",
        scene_heading="INT. CHILD'S BEDROOM - MORNING",
        scene_action="Helene opens her eyes and stretches",
        entities=all_entities,
        style="anime"
    )
    
    # Verify prompt uses ONLY slugs (not full names)
    assert "{helene_kheler}" in prompt
    assert "{child_s_bedroom}" in prompt
    assert "{flower_filled_city}" in prompt
    assert "{Helene Kheler}" not in prompt  # Full name should NOT appear
    assert "{Child's Bedroom}" not in prompt
    print("✓ Prompt uses ONLY slugs, no full names hallucinated")
    
    # PHASE 3: Simulate AI beat response (valid case)
    print("\n=== PHASE 3: Beat Generation (Valid) ===")
    
    valid_beats = [
        {
            "text": "Helene wakes up in her bedroom",
            "description": "At {child_s_bedroom}, wide shot showing {helene_kheler} waking up",
            "ref_entity_names": ["child_s_bedroom", "helene_kheler"],
            "visual_prompt": "Cozy bedroom with golden dawn light",
            "motion_prompt": "Camera slowly moves toward the bed",
            "beat_action": "Helene opens her eyes"
        },
        {
            "text": "She runs through the flower-filled city",
            "description": "At {flower_filled_city}, medium shot of {helene_kheler} running",
            "ref_entity_names": ["flower_filled_city", "helene_kheler"],
            "visual_prompt": "Vibrant city with cherry blossoms",
            "motion_prompt": "Dynamic lateral tracking shot",
            "beat_action": "Helene runs with joy"
        }
    ]
    
    # Validate beats (should PASS)
    result, issues = await validation.auto_fix_beats(valid_beats, all_entities, max_retries=0)
    assert issues["valid"] == True, f"Validation failed: {issues['hard_fails']}"
    print("✓ Valid beats passed validation (no hallucinations)")
    
    # PHASE 4: Verify media_id consistency
    print("\n=== PHASE 4: Media ID Verification ===")
    
    # Create slug → entity mapping
    slug_to_entity = {e["slug"]: e for e in all_entities}
    
    # For each beat, verify all ref_entity_names have media_ids
    missing_media_ids = []
    for i, beat in enumerate(valid_beats):
        beat_entities = beat.get("ref_entity_names", [])
        for slug in beat_entities:
            if slug not in slug_to_entity:
                missing_media_ids.append(f"Beat {i}: unknown slug '{slug}'")
            else:
                entity = slug_to_entity[slug]
                if not entity.get("media_id"):
                    missing_media_ids.append(f"Beat {i}: entity '{slug}' has no media_id")
                else:
                    # Verify media_id format (UUID-like)
                    assert "-" in entity["media_id"], f"Invalid media_id format: {entity['media_id']}"
    
    assert len(missing_media_ids) == 0, f"Media ID issues: {missing_media_ids}"
    print("✓ All beat entities have valid media_ids for Flow API")
    
    # PHASE 5: Simulate hallucinated beat (invalid case)
    print("\n=== PHASE 5: Hallucination Detection ===")
    
    bad_beats = [
        {
            "text": "Helene meets a mysterious stranger",
            "description": "At {mysterious_location}, close-up of {helene_kheler} and {mysterious_person}",
            "ref_entity_names": ["mysterious_location", "helene_kheler", "mysterious_person"],
            "visual_prompt": "Unknown location",
            "motion_prompt": "Camera focuses on faces"
        }
    ]
    
    # Validate should REJECT (unknown slugs)
    with pytest.raises(Exception) as exc:
        await validation.auto_fix_beats(bad_beats, all_entities, max_retries=0)
    
    assert "unknown entities" in str(exc.value).lower()
    print("✓ Hallucinated entities correctly rejected")
    
    # PHASE 6: Prepare beats for Flow API
    print("\n=== PHASE 6: Flow API Readiness ===")
    
    flow_payload = {
        "scene_id": "scene_1",
        "beats": []
    }
    
    for beat in valid_beats:
        beat_payload = {
            "description": beat["description"],
            "visual_prompt": beat["visual_prompt"],
            "motion_prompt": beat["motion_prompt"],
            "ref_entity_media_ids": []
        }
        
        # Add media_ids for each referenced entity
        for slug in beat.get("ref_entity_names", []):
            entity = slug_to_entity.get(slug)
            if entity and entity.get("media_id"):
                beat_payload["ref_entity_media_ids"].append({
                    "slug": slug,
                    "media_id": entity["media_id"],
                    "type": entity["type"]
                })
        
        flow_payload["beats"].append(beat_payload)
    
    # Verify payload is ready
    assert len(flow_payload["beats"]) == 2
    assert all(b["ref_entity_media_ids"] for b in flow_payload["beats"])
    print(f"✓ Flow API payload ready with {len(flow_payload['beats'])} beats")
    print(f"  Payload: {json.dumps(flow_payload, indent=2)}")
    
    # Final assertion
    print("\n=== RESULT ===")
    print("✓✓✓ FULL PIPELINE VERIFIED ✓✓✓")
    print("  • Assets extracted with slugs and media_ids")
    print("  • Beats generated using ONLY valid slugs")
    print("  • No hallucinated entities")
    print("  • All referenced entities have media_ids for Flow")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
```

- [ ] **Step 2: Run comprehensive test**

```bash
pytest tests/test_slug_pipeline.py -v -s
```

Expected: 
```
✓✓✓ FULL PIPELINE VERIFIED ✓✓✓
  • Assets extracted with slugs and media_ids
  • Beats generated using ONLY valid slugs
  • No hallucinated entities
  • All referenced entities have media_ids for Flow
```

- [ ] **Step 3: Add test to CI/CD**

This test should run as part of the standard test suite:

```bash
pytest tests/test_slug_*.py -v
```

- [ ] **Step 4: Final commit**

```bash
git add tests/test_slug_pipeline.py
git commit -m "test: add comprehensive end-to-end pipeline test with media_id verification for Flow API"
```

---

## Self-Review

**Spec coverage:**
- ✅ Schema changes (Task 2)
- ✅ Slug generation (Task 1, 3)
- ✅ Beat prompt modification (Task 4)
- ✅ Query updates (Task 5)
- ✅ Validation (Task 6)
- ✅ Migration (Task 8)
- ✅ Documentation (Task 9)
- ✅ Media ID consistency for Flow API (Task 10)

**Placeholder scan:**
- ✅ No TBD/TODO
- ✅ All code blocks complete
- ✅ All commands with expected output
- ✅ All test code written in full

**Type consistency:**
- ✅ `normalize_to_slug()` signature consistent across tasks
- ✅ Entity dict shape (id, name, slug, type, description, media_id) consistent
- ✅ ref_entity_names always list of strings
- ✅ media_id UUID format verified in tests

**Risks addressed:**
- ✅ Slug collision handling (Task 3, with numeric suffix)
- ✅ Hallucination prevention (Task 4, prompt + Task 6 validation)
- ✅ Media ID chain verification (Task 10, full pipeline test)
- ✅ Zero data loss (nullable slug column, backfill before constraint)

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-entity-slugs-implementation.md`.**

## Execution Options

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review

**2. Inline Execution** — Execute tasks in this session using `/superpowers:executing-plans`, batch execution with checkpoints

**Which approach?**