# FlowKit Webapp UX Redesign Spec

**Date:** 2026-07-10  
**Status:** Design Approved  
**Target Users:** New users (primary), advanced users (secondary)  
**Success Metric:** User can generate a complete video from start to finish without confusion

---

## Problem Statement

Current UI has 6 equal-weight tabs (Script, Assets, Storyboard, Shots, Assemble, Images) that are radically different in purpose and complexity:
- NodeEditor (1855 lines) is hidden behind edit buttons
- "Style" config is lost in the navbar
- No indication of "where am I" or "what's next"
- Multiple validation points but no clear guidance
- Keep-alive pattern in code is architectural smell

**Result:** Feels like 6 separate tools glued together, not a unified workflow.

---

## Design Solution: Sidebar + Stepped Workflow

### Architecture Overview

**Left Sidebar (250px, fixed):**
- Project name / branding
- Progress indicator: 4 steps (Setup → Review Screenplay → Review Storyboard → Done)
- Each step shows state: ✓ Done, → Current, ○ Pending
- [← Back] and [Next →] buttons at bottom
- [⚙ Settings] button for advanced options

**Right Main Area (responsive):**
- Content of current step
- Either a form (Step 1) or display + validation (Steps 2-4)
- Action buttons specific to each step

**No tabs. No hidden features. Linear progression with optional edits.**

---

## The 4 Steps

### Step 1: Setup Your Story

**User inputs:**
- Story Idea (textarea): Free-form text
- Style (textarea): Visual/narrative style guide
- Duration (dropdown): 30s, 60s, 120s, 180s
- [Generate Screenplay] button

**Advanced options (collapsed by default):**
- Model selection: Claude 3.5 Sonnet, Claude Opus, etc.
- Language: French, English, etc.
- Custom Prompt Header: System message customization
- Culture/Style Override

**Action:**
- Clicking [Generate Screenplay] → sends API call
- Shows loading state with spinner
- On success → auto-advances to Step 2

**State stored in Context:**
- idea, style, duration, model, language, custom_prompt_header
- screenplay_raw (once generated)

---

### Step 2: Review Screenplay

**Display:**
- Generated screenplay (read-only text area)
- Scene count: "4 scenes parsed"
- No NodeEditor here (screenplay is raw text, just review)

**Actions:**
- [Redo] → goes back to Step 1, keeps all inputs filled
- [Approve] → parses screenplay into scenes, auto-advances to Step 3

**On [Redo]:**
- User can edit inputs in Step 1
- Clicking [Generate Screenplay] again regenerates with new inputs
- Respects advanced options (model, language, etc.)

**On [Approve]:**
- API call: POST /api/studio/beats (for each scene)
- Shows loading state: "Generating storyboard..."
- On success → auto-advances to Step 3

**Error handling:**
- Screenplay parsing fails? Show: "Screenplay invalid. [Redo]"
- API fails? Show: "Generation failed. [Retry]"

---

### Step 3: Review Storyboard & Beats

**Display:**
- Each scene as a card or expandable section
- For each beat: description, entities {braced}, shot prompts, motion hints
- Summary: "3 beats, 2 assets needed"

**Actions (per beat):**
- [Edit] → opens NodeEditor for that specific beat
  - User can modify entities, adjust prompts, etc.
  - Saves changes back to beat
  - Returns to Step 3
- [Redo All] → regenerates all beats (respects Step 1 settings)
- [Approve] → launches image generation (async)

**On [Edit]:**
- NodeEditor opens as modal/overlay
- Only editable content: entities, beat description, shot prompts
- On save: beat updates in Step 3
- On close: returns to Step 3, beat is now marked as "manually edited"

**On [Approve]:**
- Background async job starts: generate images for each beat
- Page auto-advances to Step 4
- User sees "Your video is being generated..."

**Error handling:**
- Beat generation fails? Show per-beat error: "Failed to generate beat 2. [Retry] [Skip]"
- If user skips: proceeds with other beats, marks as incomplete
- If all skip: show "No beats. [Redo All]"

---

### Step 4: Done / Video Ready

**Display:**
- Success message: "Your video is ready!"
- Video preview or images gallery (showing generated assets)
- Video player / media carousel

**Actions:**
- [Download] → download video file
- [Try Another Project] → new project (clears state, back to Step 1)
- [Edit & Regenerate] → back to Step 3 (can re-edit beats before re-generating)

**Polling:**
- Step 4 polls /api/studio/video_status until image generation completes
- Shows progress: "3 of 4 beats complete"

---

## Advanced Options (Settings Drawer)

Accessible from anywhere via [⚙ Settings] button in sidebar.

**Contents:**
- Model selection
- Language selection
- Custom Prompt Header (system message)
- Culture/Style override
- Voice/TTS configuration (from VoiceManager)
- Continuity tracking toggle
- NodeEditor accessibility options

**Effect:**
- Changes apply to future API calls
- If user is in Step 1: affects next [Generate Screenplay]
- If user is in Step 2-3: [Redo] uses new settings
- If user is in Step 4: too late, video already generated

**UX rule:** Settings drawer is optional. New users never see it. Advanced users find it easily.

---

## State Management

**All state lives in React Context (new: WorkflowContext):**

```typescript
type WorkflowState = {
  // Step 1
  idea: string
  style: string
  duration: number
  model: string
  language: string
  customPromptHeader: string

  // Step 2
  screenplay_raw: string
  scenes: Scene[]

  // Step 3
  beats: Beat[]
  editedBeats: Set<number>

  // Step 4
  videoStatus: "pending" | "generating" | "done" | "error"
  videoUrl: string | null

  // Meta
  currentStep: 1 | 2 | 3 | 4
  loading: boolean
  error: string | null
}
```

**No keep-alive pattern needed.** State persists in Context. Components mount/unmount naturally. Jobs survive via Context.

---

## Component Structure

**Old (6 tabs):**
```
ProjectWorkspace
├─ ScriptTab (346 lines)
├─ AssetsTab (708 lines)
├─ StoryboardTab (1085 lines)
├─ ShotsTab (348 lines)
├─ AssembleTab (210 lines)
├─ AllImages (?)
└─ NodeEditor (1855 lines, hidden)
```

**New (stepped workflow):**
```
ProjectWorkspace
├─ Sidebar (progress indicator)
└─ MainContent
   ├─ Step1Setup
   ├─ Step2ReviewScreenplay
   ├─ Step3ReviewStoryboard
   │  ├─ BeatCard (per beat)
   │  └─ [Edit] → NodeEditor (modal)
   └─ Step4Done

+ WorkflowContext (manages all state)
+ NodeEditor (still exists, opened from Step 3)
```

**New components (~2-3KB each):**
- `Sidebar.tsx`: Progress indicator + navigation
- `Step1Setup.tsx`: Form for idea/style/duration
- `Step2ReviewScreenplay.tsx`: Display screenplay + [Redo]/[Approve]
- `Step3ReviewStoryboard.tsx`: Beat cards + edit actions
- `Step4Done.tsx`: Results + download/retry
- `WorkflowContext.tsx`: State management

**Components to retire:**
- `ScriptTab.tsx` (merged into Step 1-2)
- `StoryboardTab.tsx` (merged into Step 3)
- `ShotsTab.tsx`, `AssembleTab.tsx`, `AllImages.tsx` (merged into Step 4)
- `AssetsTab.tsx` (assets now managed via NodeEditor in Step 3)
- `ProjectWorkspace.tsx` (refactored to new structure)

---

## API Integration Points

**Step 1 → Step 2:**
- POST `/api/agent/run` with screenplay prompt → screenplay_raw

**Step 2 → Step 3:**
- POST `/api/studio/beats` (for each scene) → beats with prompts

**Step 3 (Edit):**
- NodeEditor → entity/beat changes (local state, no API until [Approve])
- On [Approve]: changes are committed to beats Context state

**Step 3 → Step 4:**
- POST `/api/studio/generate_images` (async) → jobId
- Step 4 polls `/api/studio/video_status?jobId={jobId}`

---

## Error Handling Strategy

| Error | Where | Show | Recovery |
|-------|-------|------|----------|
| Screenplay generation fails | Step 1 | "Failed. [Retry]" in Step 1 | Retry or edit inputs |
| Screenplay parsing fails | Step 2 | "Invalid screenplay. [Redo]" | Back to Step 1 |
| Beat generation fails | Step 3 | "Failed to generate beat X. [Retry] [Skip]" | Retry or skip beat |
| Image generation fails | Step 4 | "Image generation failed. [Retry]" | Retry or [Back to Step 3] |
| API timeout | Any | "Request timed out. [Retry]" | Retry |

**Key principle:** All errors are recoverable. User never loses work.

---

## Testing Strategy

**Unit tests:**
- WorkflowContext: state transitions, actions
- Each Step component: render correctly, call actions
- Error boundaries: catch and display errors

**Integration tests:**
- Full workflow: Step 1 → Step 2 → Step 3 → Step 4
- [Redo] flows: go back, edit, regenerate
- [Edit] flow: open NodeEditor, save, return to Step 3
- Error recovery: error → retry → success

**Manual testing:**
- First-time user journey: new → screenplay → storyboard → video
- Advanced user: edit beats, customize settings, regenerate
- Error scenarios: API fails, timeout, invalid data

---

## Migration Plan

1. **Create new components** (Step1-4, Sidebar, WorkflowContext)
2. **Keep NodeEditor as-is** (still used from Step 3)
3. **Retire old tabs gradually** (ScriptTab, AssetsTab, StoryboardTab, etc.)
4. **Test new workflow end-to-end**
5. **Deploy** (old tabs still available, switchable via feature flag if needed)

---

## Success Criteria

- ✅ New user can generate a video without visiting 6 different tabs
- ✅ Progress is always clear (sidebar shows where you are)
- ✅ Can validate screenplay before committing to expensive image generation
- ✅ Can edit beats with NodeEditor before finalizing
- ✅ All errors are recoverable (no dead ends)
- ✅ Code is simpler: 4 focused components instead of 6 bloated tabs + 1 monster NodeEditor

---

## Out of Scope

- Mobile responsiveness (can add later)
- Keyboard shortcuts (can add later)
- Undo/redo within steps (can add later)
- Batch operations (can add later)
- Project history/versioning (can add later)

---

## Notes

- **Ponytail principle:** Start with the 4-step flow. Don't over-engineer. NodeEditor stays mostly as-is, just accessed differently.
- **State management:** Use React Context, not Redux. Simple enough for this use case.
- **Loading states:** Always show spinners during API calls. Don't freeze the UI.
- **Backward compatibility:** Old project URLs still work, but new projects use new workflow.

