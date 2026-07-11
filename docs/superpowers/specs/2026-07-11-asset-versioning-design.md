# Asset Versioning & Regeneration Design

**Date:** 2026-07-11  
**Status:** Design approved  
**Scope:** Add versioning, regeneration, and history tracking to asset (character/location/prop) generation

## Problem Statement

Currently, asset reference generation is one-shot: create asset → generate reference sheet → done. Users need:
- **Exploration:** Try multiple visual approaches and pick the best
- **Iteration:** Refine prompt/instructions and regenerate if first attempt isn't satisfactory
- **History:** See what was tried before, with metadata (when, what prompt, what instructions)
- **Flexibility:** Switch back to an older version if needed

## Solution Overview

**Approach:** JSON-based versioning in the database (no major schema changes). Each asset tracks a linear timeline of generations with full metadata.

### Key Decisions

1. **Version Model:** Linear timeline (v1 → v2 → v3...), not branching
2. **Active Version:** Most recent by default, but user can explicitly restore an older one
3. **Metadata per Version:** Each version stores prompt used, instructions applied, generation timestamp, and media_id
4. **History Limit:** Keep max 10 versions per asset (oldest discarded when exceeded)
5. **Storage:** Use JSON column in `entities` table (`version_history`)

---

## Architecture

### Database Schema

Add two columns to `entities` table:

```sql
version_history TEXT        -- JSON array of version objects
active_version_num INTEGER  -- Which version number is currently active (default: latest)
```

**Version object structure:**
```json
{
  "version": 2,
  "media_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "reference_image_url": "/media/{project_id}/{media_id}.png",
  "prompt": "Sage: A wise wizard...",
  "instructions": "Black straight hair, dramatic lighting",
  "generated_at": "2026-07-11T09:15:00Z",
  "status": "success"
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/projects/{pid}/entities/{eid}/generate-reference` | POST | Initial generation (creates v1) |
| `/projects/{pid}/entities/{eid}/regenerate` | POST | Generate new version with modified prompt/instructions |
| `/projects/{pid}/entities/{eid}/history` | GET | Retrieve full version history with metadata |
| `/projects/{pid}/entities/{eid}/set-active-version` | PATCH | Switch active version (no regeneration) |

**POST `/regenerate` body:**
```json
{
  "prompt": "Sage: A wise wizard with black hair...",  // optional, replaces original
  "instructions": "More dramatic lighting, add shadows"  // optional
}
```

Response: `{ job_id: "...", version_num: 3 }`

**GET `/history` response:**
```json
{
  "entity_id": "...",
  "active_version": 2,
  "versions": [
    {
      "version": 1,
      "media_id": "...",
      "reference_image_url": "/media/...",
      "prompt": "Sage: A wise wizard with curly red hair...",
      "instructions": null,
      "generated_at": "2026-07-11T09:00:00Z",
      "status": "success"
    },
    {
      "version": 2,
      "media_id": "...",
      "reference_image_url": "/media/...",
      "prompt": "Sage: A wise wizard with curly red hair...",
      "instructions": "Black straight hair, dramatic lighting",
      "generated_at": "2026-07-11T09:15:00Z",
      "status": "success"
    }
  ]
}
```

**PATCH `/set-active-version` body:**
```json
{ "version_num": 1 }
```

### Backend Implementation (agent/api/studio.py)

1. **On initial generation (`generate_reference`):**
   - After image is generated, store in `version_history[0]` with v1
   - Set `active_version_num = 1`

2. **On regeneration (`regenerate`):**
   - Launch new generation job (same as current)
   - After image is generated, append to `version_history` as new version
   - Set `active_version_num = len(version_history)`
   - If `len(version_history) > 10`, remove oldest entry and re-number versions

3. **On get-asset (anywhere asset is retrieved):**
   - If `active_version_num` is set, use that version's data
   - Otherwise default to most recent

4. **On set-active-version:**
   - Validate `version_num` exists in history
   - Update `active_version_num`
   - No image generation, no media changes

### Frontend (Step2ReviewAssets.tsx + new components)

**Current display** → Enhanced with versioning:

For each asset (character/location/prop):
1. Display active version's image (large preview)
2. Show metadata: "v{N} · Generated {time}"
3. Add buttons:
   - **Regenerate** → opens form to edit prompt/instructions
   - **History** → opens timeline modal

**Modal: Version Timeline**
```
Version 2 (active) — 2026-07-11 09:15
  Prompt: "Sage: A wise wizard with black straight hair..."
  Instructions: "Dramatic lighting, add shadows"
  [View] [Set as Active] 

Version 1 (archived) — 2026-07-11 09:00
  Prompt: "Sage: A wise wizard with curly red hair..."
  Instructions: (none)
  [View] [Set as Active]
```

**Form: Regenerate**
```
Edit Prompt:
  [textarea: current prompt, editable]

Add Instructions (optional):
  [textarea: correction hints]

[Regenerate]  [Cancel]
```

After generation completes (via WebSocket), show v3 in the preview and update metadata.

---

## Integration Points

### Shot Generation
When a shot references an asset for prompt generation:
- Fetch the asset
- Use `active_version_num` to get the current description and image
- If user later restores v1, shots see it immediately (no need to regenerate shots)

### Library/Assets Page
- If library supports multiple entity versions, each version's image is independently reusable
- Copying an entity to a project copies `version_history` as-is

---

## Error Handling

- **Failed generation:** Add version to history with `status: "error"`, do not increment `active_version_num`
- **Stale version:** If user tries to restore a version that no longer exists (shouldn't happen), return 404
- **Concurrent regenerations:** Use DB lock to prevent race conditions during version append

---

## Limits & Constraints

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| Max versions per asset | 10 | Prevent unbounded growth; user rarely needs >5 iterations |
| Metadata in JSON | Inline | Keeps version data bound to asset; no separate queries |
| Active version default | Latest | Intuitive UX; "regenerate" naturally makes the new one active |

---

## Testing Strategy

### Unit Tests
- [ ] Append version to empty history
- [ ] Append version when at limit (10) → oldest removed
- [ ] Set active version to valid and invalid version_num
- [ ] Regenerate with modified prompt only
- [ ] Regenerate with instructions only
- [ ] Regenerate with both prompt and instructions

### Integration Tests
- [ ] End-to-end: generate asset → regenerate → see in history modal
- [ ] Restore old version → verify it's used in new shots
- [ ] Multiple regenerations → verify limit is enforced

### Manual Verification
- [ ] UI timeline displays correctly with timestamps and metadata
- [ ] "Regenerate" form pre-fills current prompt
- [ ] Switching active version updates preview immediately

---

## Success Criteria

✅ User can generate an asset once and see v1  
✅ User can click "Regenerate", modify prompt/instructions, and see v2  
✅ User can view full history timeline with metadata  
✅ User can restore any previous version as active  
✅ History is limited to 10 versions per asset  
✅ Active version is used in shots and references  

---

## Rollout Plan

1. **Migration:** Add `version_history` and `active_version_num` columns (backfill existing assets with v1)
2. **Backend:** Implement versioning API endpoints + history tracking
3. **Frontend:** Add history modal and regenerate form to Step2ReviewAssets
4. **QA:** End-to-end test workflow (generate → regenerate → restore)
5. **Ship:** Merge to main

---

## Future Enhancements (out of scope)

- Diff viewer: side-by-side comparison of two versions
- Branching: non-linear version trees if user wants to explore multiple paths
- Rollback: auto-downgrade if next version looks worse
- Batch regenerate: regenerate all assets at once with new instructions
