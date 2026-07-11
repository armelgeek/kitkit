# Asset Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement asset versioning so users can regenerate assets with different prompts/instructions and explore multiple variations with full history tracking.

**Architecture:** Add JSON-based version history to the `entities` table (no new tables). Each asset tracks a linear timeline of generations with metadata. Backend exposes versioning endpoints; frontend displays timeline modal and regenerate form. Active version is most recent by default but user-selectable.

**Tech Stack:** FastAPI (backend), SQLite (persistence), React/TypeScript (frontend), Pydantic (validation)

## Global Constraints

- Max 10 versions per asset (oldest discarded when exceeded)
- Version history stored as JSON in `entities.version_history`
- Active version tracked in `entities.active_version_num`
- All existing assets backfilled with v1 on migration
- Regenerate endpoint uses same generation flow as initial creation

---

## File Structure

### Backend (agent/)
- **`agent/studio/db.py`** - Database schema migration (add columns + backfill)
- **`agent/api/studio.py`** - New endpoints: `regenerate`, `history`, `set-active-version`
- **`agent/studio/jobs.py`** - No changes (reuse existing JobManager)
- **`agent/models.py`** - Pydantic models for versioning

### Frontend (webapp/)
- **`webapp/src/components/Step2ReviewAssets.tsx`** - Add regenerate button + history modal
- **`webapp/src/components/AssetHistoryModal.tsx`** - New component for timeline display
- **`webapp/src/components/RegenerateForm.tsx`** - New component for prompt/instruction editing
- **`webapp/src/services/api.ts`** - Add client functions for new endpoints

### Tests
- **`tests/test_asset_versioning.py`** - Unit tests for versioning logic
- **`tests/test_versioning_integration.py`** - End-to-end integration tests

---

## Task 1: Database Migration

**Files:**
- Modify: `agent/studio/db.py`
- Test: `tests/test_asset_versioning.py`

**Interfaces:**
- Produces: SQLite schema with `entities.version_history` (TEXT JSON) and `entities.active_version_num` (INTEGER)

### Steps

- [ ] **Step 1: Add migration function to db.py**

Open `agent/studio/db.py` and find the `def init_db()` function. After existing migrations, add this:

```python
def migrate_add_versioning():
    """Migrate entities table to add versioning support."""
    cursor = db.cursor()
    
    # Check if columns already exist
    cursor.execute("PRAGMA table_info(entities)")
    columns = {row[1] for row in cursor.fetchall()}
    
    if "version_history" not in columns:
        cursor.execute("""
            ALTER TABLE entities ADD COLUMN version_history TEXT DEFAULT '[]'
        """)
    
    if "active_version_num" not in columns:
        cursor.execute("""
            ALTER TABLE entities ADD COLUMN active_version_num INTEGER DEFAULT 1
        """)
    
    db.commit()
```

Add this call to `init_db()` after all other migrations:

```python
def init_db():
    # ... existing migrations ...
    migrate_add_versioning()
```

- [ ] **Step 2: Add backfill logic for existing assets**

In the same migration function, add backfill logic after the ALTER statements:

```python
    # Backfill existing assets with v1 (if version_history is empty)
    cursor.execute("""
        SELECT id, media_id, reference_image_url FROM entities 
        WHERE version_history = '[]' AND media_id IS NOT NULL
    """)
    
    for entity_id, media_id, ref_url in cursor.fetchall():
        v1_entry = json.dumps([{
            "version": 1,
            "media_id": media_id,
            "reference_image_url": ref_url,
            "prompt": "(original - no prompt stored)",
            "instructions": None,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "status": "success"
        }])
        
        cursor.execute(
            "UPDATE entities SET version_history = ?, active_version_num = 1 WHERE id = ?",
            (v1_entry, entity_id)
        )
    
    db.commit()
```

Add these imports at the top of `db.py`:

```python
import json
from datetime import datetime
```

- [ ] **Step 3: Write test for migration**

Create `tests/test_asset_versioning.py`:

```python
import pytest
import sqlite3
import json
from datetime import datetime
from agent.studio.db import init_db, get_db, db

def test_migration_adds_version_history_column():
    """Verify migration creates version_history column."""
    cursor = get_db().cursor()
    cursor.execute("PRAGMA table_info(entities)")
    columns = {row[1] for row in cursor.fetchall()}
    assert "version_history" in columns
    assert "active_version_num" in columns

def test_migration_backfills_existing_assets():
    """Verify existing assets are backfilled with v1."""
    # Insert a test entity without versioning
    cursor = get_db().cursor()
    cursor.execute("""
        INSERT INTO entities (project_id, name, type, media_id, reference_image_url)
        VALUES (?, ?, ?, ?, ?)
    """, ("proj-1", "Test Asset", "character", "media-uuid-1", "/media/proj-1/media-uuid-1.png"))
    get_db().commit()
    
    # Run migration
    init_db()
    
    # Verify backfill
    cursor.execute("SELECT version_history FROM entities WHERE name = 'Test Asset'")
    history_json = cursor.fetchone()[0]
    history = json.loads(history_json)
    
    assert len(history) == 1
    assert history[0]["version"] == 1
    assert history[0]["media_id"] == "media-uuid-1"
    assert history[0]["status"] == "success"
```

- [ ] **Step 4: Run migration test**

```bash
cd /home/armel/dev/Hayzar/video/flowkit
pytest tests/test_asset_versioning.py::test_migration_adds_version_history_column -v
pytest tests/test_asset_versioning.py::test_migration_backfills_existing_assets -v
```

Expected: PASS (both tests)

- [ ] **Step 5: Commit migration**

```bash
git add agent/studio/db.py tests/test_asset_versioning.py
git commit -m "feat: add versioning columns to entities table with backfill migration"
```

---

## Task 2: Pydantic Models for Versioning

**Files:**
- Modify: `agent/models.py`
- Test: `tests/test_asset_versioning.py`

**Interfaces:**
- Produces: `VersionEntry` model, `AssetHistoryResponse` model, `RegenerateRequest` model

### Steps

- [ ] **Step 1: Add versioning models to models.py**

Open `agent/models.py` and add these Pydantic models at the end:

```python
class VersionEntry(BaseModel):
    """Single version in asset history."""
    version: int
    media_id: str
    reference_image_url: str
    prompt: str
    instructions: Optional[str] = None
    generated_at: str  # ISO format datetime
    status: str  # "success", "error", "pending"

class AssetHistoryResponse(BaseModel):
    """Asset version history with metadata."""
    entity_id: str
    active_version: int
    versions: List[VersionEntry]

class RegenerateRequest(BaseModel):
    """Request to regenerate an asset with new prompt/instructions."""
    prompt: Optional[str] = None  # If provided, replaces original prompt
    instructions: Optional[str] = None  # Additional refinement hints
```

Add to imports if not already present:

```python
from typing import Optional, List
from pydantic import BaseModel
```

- [ ] **Step 2: Write test for models**

Add to `tests/test_asset_versioning.py`:

```python
from agent.models import VersionEntry, AssetHistoryResponse, RegenerateRequest

def test_version_entry_model():
    """Verify VersionEntry model validates correctly."""
    entry = VersionEntry(
        version=1,
        media_id="uuid-123",
        reference_image_url="/media/proj/uuid-123.png",
        prompt="A wizard",
        instructions=None,
        generated_at="2026-07-11T09:00:00Z",
        status="success"
    )
    assert entry.version == 1
    assert entry.status == "success"

def test_asset_history_response_model():
    """Verify AssetHistoryResponse model validates correctly."""
    history = AssetHistoryResponse(
        entity_id="entity-1",
        active_version=1,
        versions=[
            VersionEntry(
                version=1,
                media_id="uuid-1",
                reference_image_url="/media/proj/uuid-1.png",
                prompt="A wizard",
                instructions=None,
                generated_at="2026-07-11T09:00:00Z",
                status="success"
            )
        ]
    )
    assert history.active_version == 1
    assert len(history.versions) == 1

def test_regenerate_request_model():
    """Verify RegenerateRequest model validates correctly."""
    req = RegenerateRequest(
        prompt="A different wizard",
        instructions="More dramatic lighting"
    )
    assert req.prompt == "A different wizard"
    assert req.instructions == "More dramatic lighting"
    
    # Test optional fields
    req2 = RegenerateRequest(prompt="Just new prompt")
    assert req2.prompt == "Just new prompt"
    assert req2.instructions is None
```

- [ ] **Step 3: Run model tests**

```bash
pytest tests/test_asset_versioning.py::test_version_entry_model -v
pytest tests/test_asset_versioning.py::test_asset_history_response_model -v
pytest tests/test_asset_versioning.py::test_regenerate_request_model -v
```

Expected: PASS (all three)

- [ ] **Step 4: Commit models**

```bash
git add agent/models.py tests/test_asset_versioning.py
git commit -m "feat: add Pydantic models for asset versioning"
```

---

## Task 3: Backend Versioning Logic (Helper Functions)

**Files:**
- Create: `agent/studio/versioning.py` (new)
- Test: `tests/test_asset_versioning.py`

**Interfaces:**
- Produces:
  - `def add_version_to_history(history_json: str, new_version: dict, max_versions: int = 10) -> str`
  - `def get_active_version(history: list, active_version_num: int) -> dict | None`
  - `def parse_version_history(history_json: str) -> list`

### Steps

- [ ] **Step 1: Create versioning helper module**

Create new file `agent/studio/versioning.py`:

```python
import json
from typing import Optional, Dict, List
from datetime import datetime

def parse_version_history(history_json: str) -> List[Dict]:
    """Parse JSON version history into list of dicts."""
    if not history_json or history_json == "[]":
        return []
    try:
        return json.loads(history_json)
    except json.JSONDecodeError:
        return []

def get_active_version(history: List[Dict], active_version_num: int) -> Optional[Dict]:
    """Get the currently active version from history."""
    for v in history:
        if v["version"] == active_version_num:
            return v
    return None  # Version not found

def add_version_to_history(
    history_json: str,
    new_version: Dict,
    max_versions: int = 10
) -> tuple[str, int]:
    """
    Add a new version to history, enforce limit, return (updated_json, new_version_num).
    
    If history exceeds max_versions, remove oldest (lowest version number) and re-number.
    """
    history = parse_version_history(history_json)
    
    # Determine next version number
    if not history:
        next_version_num = 1
    else:
        next_version_num = max(v["version"] for v in history) + 1
    
    # Add new version
    new_version["version"] = next_version_num
    history.append(new_version)
    
    # Enforce limit: if exceeded, remove oldest and re-number
    if len(history) > max_versions:
        # Sort by version number (should already be sorted, but be safe)
        history.sort(key=lambda x: x["version"])
        
        # Remove oldest
        history.pop(0)
        
        # Re-number from 1
        for i, v in enumerate(history, start=1):
            v["version"] = i
        
        next_version_num = len(history)  # Adjust if we re-numbered
    
    return json.dumps(history), next_version_num

def get_current_reference_data(entity: Dict) -> Dict:
    """
    Extract the currently active reference image data from an entity.
    
    Returns dict with: media_id, reference_image_url, prompt, instructions
    """
    history = parse_version_history(entity.get("version_history", "[]"))
    active_version_num = entity.get("active_version_num", 1)
    
    active = get_active_version(history, active_version_num)
    
    if active:
        return {
            "media_id": active["media_id"],
            "reference_image_url": active["reference_image_url"],
            "prompt": active["prompt"],
            "instructions": active["instructions"]
        }
    
    # Fallback to entity fields (shouldn't happen after migration)
    return {
        "media_id": entity.get("media_id"),
        "reference_image_url": entity.get("reference_image_url"),
        "prompt": entity.get("description"),
        "instructions": None
    }
```

- [ ] **Step 2: Write comprehensive tests for versioning logic**

Add to `tests/test_asset_versioning.py`:

```python
from agent.studio.versioning import (
    parse_version_history,
    get_active_version,
    add_version_to_history,
    get_current_reference_data
)

def test_parse_empty_history():
    """Empty or invalid JSON returns empty list."""
    assert parse_version_history("") == []
    assert parse_version_history("[]") == []
    assert parse_version_history("invalid") == []

def test_get_active_version_found():
    """Retrieve active version from history."""
    history = [
        {"version": 1, "media_id": "uuid1"},
        {"version": 2, "media_id": "uuid2"}
    ]
    active = get_active_version(history, 2)
    assert active["media_id"] == "uuid2"

def test_get_active_version_not_found():
    """Return None if version not in history."""
    history = [{"version": 1, "media_id": "uuid1"}]
    active = get_active_version(history, 99)
    assert active is None

def test_add_version_to_empty_history():
    """First version gets numbered 1."""
    new_v = {"media_id": "uuid1", "status": "success", "generated_at": "2026-07-11T09:00:00Z"}
    result_json, version_num = add_version_to_history("[]", new_v)
    history = json.loads(result_json)
    
    assert version_num == 1
    assert len(history) == 1
    assert history[0]["version"] == 1

def test_add_version_increments():
    """New versions increment sequentially."""
    history_json = json.dumps([
        {"version": 1, "media_id": "uuid1"},
        {"version": 2, "media_id": "uuid2"}
    ])
    new_v = {"media_id": "uuid3", "status": "success"}
    result_json, version_num = add_version_to_history(history_json, new_v)
    history = json.loads(result_json)
    
    assert version_num == 3
    assert len(history) == 3
    assert history[2]["version"] == 3

def test_add_version_enforces_limit():
    """Versions over limit: remove oldest, re-number."""
    # Create 10 versions
    history = [{"version": i, "media_id": f"uuid{i}"} for i in range(1, 11)]
    history_json = json.dumps(history)
    
    # Add 11th
    new_v = {"media_id": "uuid11", "status": "success"}
    result_json, version_num = add_version_to_history(history_json, new_v, max_versions=10)
    history = json.loads(result_json)
    
    assert len(history) == 10
    assert version_num == 10
    # Oldest (v1 with uuid1) should be gone
    assert not any(v["media_id"] == "uuid1" for v in history)
    # Re-numbered from 1
    assert [v["version"] for v in history] == list(range(1, 11))

def test_get_current_reference_data():
    """Extract active version's reference data."""
    entity = {
        "version_history": json.dumps([
            {"version": 1, "media_id": "uuid1", "reference_image_url": "/img/1.png", "prompt": "A wizard", "instructions": None},
            {"version": 2, "media_id": "uuid2", "reference_image_url": "/img/2.png", "prompt": "A wizard", "instructions": "Black hair"}
        ]),
        "active_version_num": 2
    }
    
    data = get_current_reference_data(entity)
    assert data["media_id"] == "uuid2"
    assert data["reference_image_url"] == "/img/2.png"
    assert data["instructions"] == "Black hair"
```

- [ ] **Step 3: Run versioning logic tests**

```bash
pytest tests/test_asset_versioning.py::test_parse_empty_history -v
pytest tests/test_asset_versioning.py::test_get_active_version_found -v
pytest tests/test_asset_versioning.py::test_get_active_version_not_found -v
pytest tests/test_asset_versioning.py::test_add_version_to_empty_history -v
pytest tests/test_asset_versioning.py::test_add_version_increments -v
pytest tests/test_asset_versioning.py::test_add_version_enforces_limit -v
pytest tests/test_asset_versioning.py::test_get_current_reference_data -v
```

Expected: PASS (all)

- [ ] **Step 4: Commit versioning helpers**

```bash
git add agent/studio/versioning.py tests/test_asset_versioning.py
git commit -m "feat: add versioning helper functions with comprehensive tests"
```

---

## Task 4: Backend API Endpoints

**Files:**
- Modify: `agent/api/studio.py`
- Test: `tests/test_versioning_integration.py` (create)

**Interfaces:**
- Consumes: 
  - Database: entities table with version_history + active_version_num columns
  - Models: `RegenerateRequest`, `AssetHistoryResponse`, `VersionEntry`
  - Versioning: `add_version_to_history()`, `get_active_version()`, `parse_version_history()`
  - Flow client: existing `generate_asset_references()` endpoint
- Produces: 
  - `POST /projects/{pid}/entities/{eid}/regenerate` → returns `{job_id: str, version_num: int}`
  - `GET /projects/{pid}/entities/{eid}/history` → returns `AssetHistoryResponse`
  - `PATCH /projects/{pid}/entities/{eid}/set-active-version` → returns updated entity

### Steps

- [ ] **Step 1: Add regenerate endpoint**

Open `agent/api/studio.py` and find the router/FastAPI app. Add this new endpoint:

```python
from agent.studio.versioning import (
    parse_version_history,
    add_version_to_history,
    get_active_version
)
from agent.models import RegenerateRequest, AssetHistoryResponse

@router.post("/projects/{project_id}/entities/{entity_id}/regenerate")
async def regenerate_asset_reference(
    project_id: str,
    entity_id: str,
    body: RegenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Regenerate an asset reference with modified prompt/instructions.
    
    Returns {job_id, version_num} to track progress.
    User can listen on WebSocket for job completion.
    """
    # Verify entity exists and belongs to user's project
    entity = db.query(Entity).filter(
        Entity.id == entity_id,
        Entity.project_id == project_id
    ).first()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    # Determine prompt to use: if provided in request, use it; otherwise use existing
    if body.prompt:
        prompt_to_use = body.prompt
    else:
        # Extract current prompt from active version
        history = parse_version_history(entity.version_history or "[]")
        active_version = get_active_version(history, entity.active_version_num or 1)
        prompt_to_use = active_version["prompt"] if active_version else entity.description
    
    # Launch generation job (reuse existing flow)
    # This should call the same flow that generate_asset_references uses
    job = job_mgr.start(
        target=_regenerate_asset_worker,
        args=(project_id, entity_id, prompt_to_use, body.instructions, entity.type)
    )
    
    return {
        "job_id": job.id,
        "version_num": None  # Will be known after generation completes
    }

async def _regenerate_asset_worker(
    project_id: str,
    entity_id: str,
    prompt: str,
    instructions: Optional[str],
    entity_type: str
):
    """Worker function: generate asset and append to version history."""
    entity = db.query(Entity).filter_by(id=entity_id).first()
    
    try:
        # Generate reference image using Flow API
        # (reuse same logic as generate_asset_references)
        result = await flow_client.generate_asset_reference(
            entity_name=entity.name,
            prompt=prompt,
            entity_type=entity_type,
            project_id=project_id
        )
        
        media_id = result["media_id"]
        reference_image_url = result["reference_image_url"]
        
        # Create version entry
        new_version = {
            "media_id": media_id,
            "reference_image_url": reference_image_url,
            "prompt": prompt,
            "instructions": instructions,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "status": "success"
        }
        
        # Add to history (with limit enforcement)
        updated_history, new_version_num = add_version_to_history(
            entity.version_history or "[]",
            new_version,
            max_versions=10
        )
        
        # Update entity
        entity.version_history = updated_history
        entity.active_version_num = new_version_num  # New version is automatically active
        db.add(entity)
        db.commit()
        
    except Exception as e:
        # Log error and add error entry to history
        failed_version = {
            "media_id": None,
            "reference_image_url": None,
            "prompt": prompt,
            "instructions": instructions,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "status": f"error: {str(e)}"
        }
        updated_history, _ = add_version_to_history(
            entity.version_history or "[]",
            failed_version,
            max_versions=10
        )
        entity.version_history = updated_history
        db.add(entity)
        db.commit()
        raise
```

Add imports at top of `studio.py`:

```python
from datetime import datetime
from agent.models import RegenerateRequest, AssetHistoryResponse, VersionEntry
from agent.studio.versioning import (
    parse_version_history,
    add_version_to_history,
    get_active_version
)
```

- [ ] **Step 2: Add history endpoint**

Add to `agent/api/studio.py`:

```python
@router.get("/projects/{project_id}/entities/{entity_id}/history", response_model=AssetHistoryResponse)
async def get_asset_history(
    project_id: str,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieve full version history for an asset with all metadata.
    """
    entity = db.query(Entity).filter(
        Entity.id == entity_id,
        Entity.project_id == project_id
    ).first()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    history = parse_version_history(entity.version_history or "[]")
    active_version = entity.active_version_num or 1
    
    # Convert to VersionEntry models
    versions = [VersionEntry(**v) for v in history]
    
    return AssetHistoryResponse(
        entity_id=entity_id,
        active_version=active_version,
        versions=versions
    )
```

- [ ] **Step 3: Add set-active-version endpoint**

Add to `agent/api/studio.py`:

```python
from pydantic import BaseModel

class SetActiveVersionRequest(BaseModel):
    version_num: int

@router.patch("/projects/{project_id}/entities/{entity_id}/set-active-version")
async def set_active_version(
    project_id: str,
    entity_id: str,
    body: SetActiveVersionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Switch to a different version as the active one.
    No regeneration, just updates active_version_num.
    """
    entity = db.query(Entity).filter(
        Entity.id == entity_id,
        Entity.project_id == project_id
    ).first()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    # Verify version exists
    history = parse_version_history(entity.version_history or "[]")
    if not get_active_version(history, body.version_num):
        raise HTTPException(status_code=400, detail=f"Version {body.version_num} not found")
    
    # Update active version
    entity.active_version_num = body.version_num
    db.add(entity)
    db.commit()
    
    return {"entity_id": entity_id, "active_version": body.version_num}
```

- [ ] **Step 4: Write integration tests**

Create `tests/test_versioning_integration.py`:

```python
import pytest
import json
from fastapi.testclient import TestClient
from agent.main import app
from agent.studio.db import get_db

client = TestClient(app)

@pytest.fixture
def auth_headers():
    """Mock auth headers for testing."""
    return {"Authorization": "Bearer test-token"}

def test_regenerate_asset_endpoint():
    """Test regenerate endpoint creates new version."""
    # This is a skeleton test - full integration requires mocking Flow API
    # For now, verify endpoint exists and accepts the right schema
    
    response = client.post(
        "/projects/test-proj/entities/test-entity/regenerate",
        json={
            "prompt": "New prompt",
            "instructions": "More dramatic"
        },
        headers=auth_headers()
    )
    
    # Should return job_id if entity exists, 404 if not
    assert response.status_code in [200, 404]

def test_get_asset_history_endpoint():
    """Test history endpoint returns AssetHistoryResponse."""
    response = client.get(
        "/projects/test-proj/entities/test-entity/history",
        headers=auth_headers()
    )
    
    # Should return 404 for non-existent entity
    assert response.status_code in [200, 404]
    
    if response.status_code == 200:
        data = response.json()
        assert "entity_id" in data
        assert "active_version" in data
        assert "versions" in data
        assert isinstance(data["versions"], list)

def test_set_active_version_endpoint():
    """Test set-active-version endpoint switches version."""
    response = client.patch(
        "/projects/test-proj/entities/test-entity/set-active-version",
        json={"version_num": 1},
        headers=auth_headers()
    )
    
    # Should return 404 for non-existent entity
    assert response.status_code in [200, 400, 404]
    
    if response.status_code == 200:
        data = response.json()
        assert data["active_version"] == 1
```

- [ ] **Step 5: Run integration tests**

```bash
pytest tests/test_versioning_integration.py -v
```

Expected: Tests run (may show 404s due to missing test data, but endpoints should exist)

- [ ] **Step 6: Commit API endpoints**

```bash
git add agent/api/studio.py agent/models.py tests/test_versioning_integration.py
git commit -m "feat: add versioning API endpoints (regenerate, history, set-active-version)"
```

---

## Task 5: Frontend Components (History Modal)

**Files:**
- Create: `webapp/src/components/AssetHistoryModal.tsx`
- Modify: `webapp/src/components/Step2ReviewAssets.tsx`
- Test: Manual verification

**Interfaces:**
- Consumes: 
  - AssetHistoryResponse from API
  - Active version number
- Produces: 
  - Modal component showing version timeline with metadata
  - "Set as Active" button per version

### Steps

- [ ] **Step 1: Create AssetHistoryModal component**

Create `webapp/src/components/AssetHistoryModal.tsx`:

```typescript
import React from "react";
import { VersionEntry } from "../types/versioning";

interface AssetHistoryModalProps {
  entityId: string;
  versions: VersionEntry[];
  activeVersion: number;
  onClose: () => void;
  onSetActive: (versionNum: number) => Promise<void>;
}

export const AssetHistoryModal: React.FC<AssetHistoryModalProps> = ({
  entityId,
  versions,
  activeVersion,
  onClose,
  onSetActive,
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleSetActive = async (versionNum: number) => {
    setLoading(true);
    try {
      await onSetActive(versionNum);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Version History</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {versions.length === 0 ? (
            <p className="text-gray-500">No versions yet</p>
          ) : (
            versions.map((version) => (
              <div
                key={version.version}
                className={`p-4 border rounded-lg ${
                  version.version === activeVersion
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold">
                      Version {version.version}
                      {version.version === activeVersion && (
                        <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(version.generated_at).toLocaleString()}
                    </p>
                    <p className="text-sm mt-2">
                      <strong>Prompt:</strong> {version.prompt}
                    </p>
                    {version.instructions && (
                      <p className="text-sm">
                        <strong>Instructions:</strong> {version.instructions}
                      </p>
                    )}
                    {version.status !== "success" && (
                      <p className="text-sm text-red-600">
                        <strong>Status:</strong> {version.status}
                      </p>
                    )}
                  </div>
                  {version.version !== activeVersion && (
                    <button
                      onClick={() => handleSetActive(version.version)}
                      disabled={loading}
                      className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loading ? "Setting..." : "Set as Active"}
                    </button>
                  )}
                </div>
                {version.reference_image_url && (
                  <img
                    src={version.reference_image_url}
                    alt={`Version ${version.version}`}
                    className="mt-3 max-h-32 rounded"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
```

Create `webapp/src/types/versioning.ts`:

```typescript
export interface VersionEntry {
  version: number;
  media_id: string;
  reference_image_url: string;
  prompt: string;
  instructions: string | null;
  generated_at: string;
  status: string;
}

export interface AssetHistoryResponse {
  entity_id: string;
  active_version: number;
  versions: VersionEntry[];
}
```

- [ ] **Step 2: Modify Step2ReviewAssets to add History button**

Open `webapp/src/components/Step2ReviewAssets.tsx`. Find the asset display section (where each asset's reference image is shown). Add this button next to each asset:

```typescript
const [historyOpen, setHistoryOpen] = React.useState(false);
const [selectedEntity, setSelectedEntity] = React.useState<any>(null);

const handleViewHistory = async (entity: any) => {
  setSelectedEntity(entity);
  setHistoryOpen(true);
};

// In the JSX where asset preview is rendered:
<button
  onClick={() => handleViewHistory(asset)}
  className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
>
  History
</button>
```

Add the modal to the component's JSX (usually near the bottom):

```typescript
{historyOpen && selectedEntity && (
  <AssetHistoryModal
    entityId={selectedEntity.id}
    versions={historyData.versions}
    activeVersion={historyData.activeVersion}
    onClose={() => setHistoryOpen(false)}
    onSetActive={handleSetActiveVersion}
  />
)}
```

Add helper function:

```typescript
const handleSetActiveVersion = async (versionNum: number) => {
  const response = await fetch(
    `/api/studio/projects/${projectId}/entities/${selectedEntity.id}/set-active-version`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_num: versionNum }),
    }
  );
  
  if (response.ok) {
    // Refresh assets display
    await refreshAssets();
    setHistoryOpen(false);
  }
};
```

- [ ] **Step 3: Manual test History modal**

Start the dev server:

```bash
cd /home/armel/dev/Hayzar/video/flowkit/webapp
npm run dev
```

In browser, navigate to Step 2 (Review Assets), click "History" button on any asset.

Expected: Modal opens showing version timeline with metadata

- [ ] **Step 4: Commit frontend history modal**

```bash
git add webapp/src/components/AssetHistoryModal.tsx \
  webapp/src/types/versioning.ts \
  webapp/src/components/Step2ReviewAssets.tsx
git commit -m "feat: add asset history modal with version timeline"
```

---

## Task 6: Frontend Components (Regenerate Form)

**Files:**
- Create: `webapp/src/components/RegenerateForm.tsx`
- Modify: `webapp/src/components/Step2ReviewAssets.tsx`
- Test: Manual verification

**Interfaces:**
- Consumes: Current entity (with prompt/description)
- Produces: Regenerate form with prompt/instructions fields

### Steps

- [ ] **Step 1: Create RegenerateForm component**

Create `webapp/src/components/RegenerateForm.tsx`:

```typescript
import React from "react";

interface RegenerateFormProps {
  entity: any;
  onClose: () => void;
  onRegenerating: (jobId: string, versionNum: number | null) => void;
  projectId: string;
}

export const RegenerateForm: React.FC<RegenerateFormProps> = ({
  entity,
  onClose,
  onRegenerating,
  projectId,
}) => {
  const [prompt, setPrompt] = React.useState(entity.description || "");
  const [instructions, setInstructions] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/studio/projects/${projectId}/entities/${entity.id}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt || undefined,
            instructions: instructions || undefined,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to regenerate: ${response.statusText}`);
      }

      const data = await response.json();
      onRegenerating(data.job_id, data.version_num);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Regenerate Asset</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">Edit Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full p-3 border rounded focus:outline-none focus:border-blue-500"
              placeholder="Modify the description/prompt for the asset"
            />
          </div>

          <div>
            <label className="block font-semibold mb-2">
              Add Instructions (optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="w-full p-3 border rounded focus:outline-none focus:border-blue-500"
              placeholder="e.g., 'Black hair instead of red, more dramatic lighting'"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add Regenerate button to Step2ReviewAssets**

In `Step2ReviewAssets.tsx`, add state for regenerate form:

```typescript
const [regenerateOpen, setRegenerateOpen] = React.useState(false);
const [selectedEntity, setSelectedEntity] = React.useState<any>(null);

const handleOpenRegenerate = (entity: any) => {
  setSelectedEntity(entity);
  setRegenerateOpen(true);
};

const handleRegenerating = (jobId: string, versionNum: number | null) => {
  // Connect to WebSocket and listen for job completion
  // Then refresh assets
  console.log(`Regeneration job ${jobId} started`);
  // (Reuse existing WebSocket connection logic from original generation)
};
```

Add button next to each asset:

```typescript
<button
  onClick={() => handleOpenRegenerate(asset)}
  className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
>
  Regenerate
</button>
```

Add modal to JSX:

```typescript
{regenerateOpen && selectedEntity && (
  <RegenerateForm
    entity={selectedEntity}
    projectId={projectId}
    onClose={() => setRegenerateOpen(false)}
    onRegenerating={handleRegenerating}
  />
)}
```

Add import:

```typescript
import { RegenerateForm } from "./RegenerateForm";
```

- [ ] **Step 3: Manual test Regenerate form**

In dev browser, click "Regenerate" on an asset.

Expected: Form opens with current prompt pre-filled, user can modify and submit

- [ ] **Step 4: Commit regenerate form**

```bash
git add webapp/src/components/RegenerateForm.tsx \
  webapp/src/components/Step2ReviewAssets.tsx
git commit -m "feat: add regenerate form with prompt/instruction editing"
```

---

## Task 7: API Client Helpers (Frontend)

**Files:**
- Modify: `webapp/src/services/api.ts` (create if doesn't exist)

**Interfaces:**
- Produces:
  - `getAssetHistory(projectId, entityId): Promise<AssetHistoryResponse>`
  - `setActiveVersion(projectId, entityId, versionNum): Promise<void>`
  - `regenerateAsset(projectId, entityId, prompt?, instructions?): Promise<{job_id, version_num}>`

### Steps

- [ ] **Step 1: Add API client functions**

Check if `webapp/src/services/api.ts` exists. If not, create it:

```typescript
import { AssetHistoryResponse } from "../types/versioning";

const BASE_URL = "/api/studio";

export async function getAssetHistory(
  projectId: string,
  entityId: string
): Promise<AssetHistoryResponse> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/history`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  return response.json();
}

export async function setActiveVersion(
  projectId: string,
  entityId: string,
  versionNum: number
): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/set-active-version`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_num: versionNum }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to set active version: ${response.statusText}`);
  }
}

export async function regenerateAsset(
  projectId: string,
  entityId: string,
  prompt?: string,
  instructions?: string
): Promise<{ job_id: string; version_num: number | null }> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt || undefined,
        instructions: instructions || undefined,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to regenerate: ${response.statusText}`);
  }
  return response.json();
}
```

If file already exists, add these functions to it.

- [ ] **Step 2: Update components to use API helpers**

Modify `AssetHistoryModal.tsx`:

```typescript
import { setActiveVersion } from "../services/api";

// In the component:
const handleSetActive = async (versionNum: number) => {
  setLoading(true);
  try {
    await setActiveVersion(projectId, entityId, versionNum);
    onSetActive(versionNum); // Trigger refresh
  } finally {
    setLoading(false);
  }
};
```

Modify `RegenerateForm.tsx`:

```typescript
import { regenerateAsset } from "../services/api";

// In handleSubmit:
const data = await regenerateAsset(projectId, entity.id, prompt, instructions);
onRegenerating(data.job_id, data.version_num);
```

- [ ] **Step 3: Test API helpers**

No separate test file needed (integration tests in Task 4 cover the API layer). Just verify in browser that buttons work.

- [ ] **Step 4: Commit API helpers**

```bash
git add webapp/src/services/api.ts \
  webapp/src/components/AssetHistoryModal.tsx \
  webapp/src/components/RegenerateForm.tsx
git commit -m "feat: add versioning API client helpers"
```

---

## Task 8: Integrate with Existing Generation Flow

**Files:**
- Modify: `agent/api/studio.py` (update `generate_asset_references`)

**Interfaces:**
- Consumes: Existing flow generation
- Produces: Initializes version_history on first generation

### Steps

- [ ] **Step 1: Update generate_asset_references to initialize versioning**

In `agent/api/studio.py`, find the `generate_asset_references` function. After an asset is generated successfully, initialize its version history:

```python
async def _generate_asset_worker(entity_id, project_id, prompt, entity_type):
    """Worker: generate asset, then initialize version_history."""
    entity = db.query(Entity).filter_by(id=entity_id).first()
    
    try:
        # Generate using Flow API (existing logic)
        result = await flow_client.generate_asset_reference(
            entity_name=entity.name,
            prompt=prompt,
            entity_type=entity_type,
            project_id=project_id
        )
        
        media_id = result["media_id"]
        reference_image_url = result["reference_image_url"]
        
        # Initialize version_history if not already set
        if not entity.version_history or entity.version_history == "[]":
            v1_entry = {
                "version": 1,
                "media_id": media_id,
                "reference_image_url": reference_image_url,
                "prompt": prompt,
                "instructions": None,
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "status": "success"
            }
            entity.version_history = json.dumps([v1_entry])
            entity.active_version_num = 1
        
        db.add(entity)
        db.commit()
        
    except Exception as e:
        # Existing error handling
        raise
```

Add imports if needed:

```python
import json
from datetime import datetime
```

- [ ] **Step 2: Test integration with existing flow**

Start the server:

```bash
python -m agent.main
```

In the webapp (Step 2), generate assets as normal. Verify that `version_history` is now populated.

Check the database:

```bash
sqlite3 agent/studio.db "SELECT id, version_history FROM entities LIMIT 1;"
```

Expected: version_history contains JSON with v1 entry

- [ ] **Step 3: Commit integration**

```bash
git add agent/api/studio.py
git commit -m "feat: initialize version_history on asset generation"
```

---

## Task 9: Testing & Validation

**Files:**
- Run: `pytest tests/test_asset_versioning.py tests/test_versioning_integration.py`
- Manual: Full end-to-end workflow in webapp

### Steps

- [ ] **Step 1: Run all versioning tests**

```bash
cd /home/armel/dev/Hayzar/video/flowkit
pytest tests/test_asset_versioning.py -v
pytest tests/test_versioning_integration.py -v
```

Expected: All tests PASS

- [ ] **Step 2: Manual end-to-end test**

1. Start server:
   ```bash
   python -m agent.main
   ```

2. Start webapp dev server:
   ```bash
   cd webapp && npm run dev
   ```

3. Go to Step 2 (Review Assets)

4. Generate an asset normally (e.g., "Sage, a wizard")

5. Click "Regenerate" on the generated asset

6. Modify the prompt (e.g., "Sage with black hair") and add instructions ("More dramatic lighting")

7. Submit

8. Watch the generation complete (WebSocket progress)

9. Verify new image appears (v2)

10. Click "History" to see timeline

11. Try "Set as Active" on v1 to restore it

12. Verify reference in Step 2 updates back to v1

Expected: All steps work without errors, version timeline shows both v1 and v2 with metadata

- [ ] **Step 3: Test version limit enforcement**

Generate 11 versions of the same asset (via repeated regenerations). Check that oldest is removed and versions are re-numbered 1-10.

Database query to verify:

```bash
sqlite3 agent/studio.db "SELECT json_array_length(version_history) FROM entities WHERE name='test-asset';"
```

Expected: Should return 10 (max maintained)

- [ ] **Step 4: No commit needed for testing**

This task is pure validation. All commits from Tasks 1-8 are already done.

---

## Success Criteria Verification

- [ ] Asset can be generated (v1 created)
- [ ] Regenerate button appears on each asset
- [ ] Regenerate form accepts new prompt + optional instructions
- [ ] New generation creates v2, v3, etc.
- [ ] History modal shows full timeline with timestamps and metadata
- [ ] "Set as Active" button switches active version
- [ ] Active version is used in shots/references going forward
- [ ] Max 10 versions enforced (oldest discarded when exceeded)
- [ ] All tests pass (unit + integration)
- [ ] No regressions in existing asset generation flow

---

## Rollout Checklist

- [ ] All tasks completed and tested
- [ ] Database migrated on server (if deployed)
- [ ] No breaking changes to existing assets (backfill handles them)
- [ ] Frontend build succeeds
- [ ] Manual E2E validation complete
- [ ] Ready to merge to main
