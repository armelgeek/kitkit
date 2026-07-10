# FlowKit 4-Step Workflow: Manual Testing Checklist

## Setup
- [ ] Start: `npm run dev` in `webapp/`
- [ ] Open http://localhost:5173
- [ ] Verify header shows "Flow Studio"

## Step 1: New Project (Setup)
- [ ] Click "+ New project" → form appears
- [ ] Fill: idea, style, duration, model, language
- [ ] Click "Generate Screenplay" → loading indicator
- [ ] Screenplay generates (or error shows gracefully)

## Step 2: Review Screenplay
- [ ] Screenplay text displays
- [ ] Can scroll screenplay
- [ ] "Redo" button resets to Step 1
- [ ] "Approve" calls beats API → advances to Step 3

## Step 3: Review Storyboard
- [ ] Beats list shows (N beats · Ready to generate images)
- [ ] Each BeatCard displays: heading, description, entities, shot prompts, motion hints
- [ ] Yellow "✎ Manually edited" badge appears on edited beats
- [ ] **Edit button** opens NodeEditor modal
  - [ ] NodeEditor loads beat data
  - [ ] Close button (X) hides editor without changes
  - [ ] Apply saves changes → beat marked as edited
- [ ] "Redo All" resets to Step 2
- [ ] "Generate Images" button disabled if no beats
- [ ] "Generate Images" enabled + clickable when beats exist

## Step 4: Done (Video Status)
- [ ] Video status displays (pending → generating → done)
- [ ] Video URL shows when ready
- [ ] Error message if generation fails
- [ ] Can navigate back to Step 3 (or other steps via Sidebar)

## Sidebar Navigation
- [ ] All 4 steps visible in sidebar
- [ ] Current step highlighted
- [ ] Can click completed steps to go back (forward locked)
- [ ] Progress indicator updates correctly

## Error Handling
- [ ] Network error → recoverable message
- [ ] Missing data → appropriate error display
- [ ] Retry flows work

## Feature Flag
- [ ] Set `USE_NEW_WORKFLOW = false` in ProjectGrid.tsx
- [ ] Old 6-tab UI loads (ProjectWorkspace)
- [ ] Set back to `true` → new UI loads

---
**Estimated time:** 15 min  
**Pass if:** All steps work end-to-end without crashes
