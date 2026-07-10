# FlowKit UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6-tab linear UI with a 4-step sidebar workflow (Setup → Review Screenplay → Review Storyboard → Done) that guides new users without confusion while remaining powerful for advanced users.

**Architecture:** New workflow components (Step1-4) managed by centralized WorkflowContext, rendered by MainContent router. Old tabs retired. NodeEditor opened from Step 3 for beat editing. State lives in Context, not in DOM (eliminates keep-alive pattern).

**Tech Stack:** React 18+, TypeScript, Tailwind CSS, React Context (state), existing `/api/agent/run`, `/api/studio/*` endpoints

## Global Constraints

- No breaking changes to existing API endpoints
- NodeEditor component stays as-is (1855 lines), opened from Step 3
- State in React Context, no Redux or external state management
- Target: new users (primary), advanced users (secondary)
- Error states must be recoverable (no dead ends)
- Support French and English (language already configurable)

---

### Task 1: Create WorkflowContext (state management)

**Files:**
- Create: `webapp/src/context/WorkflowContext.tsx`
- Create: `webapp/src/types/workflow.ts`
- Test: `tests/workflow/WorkflowContext.test.tsx`

**Interfaces:**
- Consumes: None (foundation task)
- Produces: `WorkflowContext`, `WorkflowState`, `WorkflowActions` types and hook `useWorkflow()`

---

### Task 2: Create Sidebar component

**Files:**
- Create: `webapp/src/components/workflow/Sidebar.tsx`
- Test: `tests/workflow/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useWorkflow()` from WorkflowContext
- Produces: `Sidebar` component that displays progress and navigation

---

### Task 3: Create Step1Setup component

**Files:**
- Create: `webapp/src/components/workflow/Step1Setup.tsx`
- Test: `tests/workflow/Step1Setup.test.tsx`

**Interfaces:**
- Consumes: `useWorkflow()`, `api.generateScreenplay()` (TODO in API)
- Produces: `Step1Setup` component with form inputs and generate button

---

### Task 4: Create Step2ReviewScreenplay component

**Files:**
- Create: `webapp/src/components/workflow/Step2ReviewScreenplay.tsx`
- Test: `tests/workflow/Step2ReviewScreenplay.test.tsx`

**Interfaces:**
- Consumes: `useWorkflow()` from WorkflowContext, screenplay from state
- Produces: `Step2ReviewScreenplay` component with screenplay display and actions

---

### Task 5: Create BeatCard and Step3ReviewStoryboard components

**Files:**
- Create: `webapp/src/components/workflow/BeatCard.tsx`
- Create: `webapp/src/components/workflow/Step3ReviewStoryboard.tsx`
- Test: `tests/workflow/Step3ReviewStoryboard.test.tsx`

**Interfaces:**
- Consumes: `useWorkflow()`, Beat data from state
- Produces: `BeatCard` (single beat display), `Step3ReviewStoryboard` (container with beat list, edit/redo/approve actions)

---

### Task 6: Create Step4Done component

**Files:**
- Create: `webapp/src/components/workflow/Step4Done.tsx`
- Test: `tests/workflow/Step4Done.test.tsx`

**Interfaces:**
- Consumes: `useWorkflow()`, video generation status from state
- Produces: `Step4Done` component with video result display and actions

---

### Task 7: Create MainContent router and ProjectWorkspaceNew wrapper

**Files:**
- Create: `webapp/src/components/workflow/MainContent.tsx`
- Create: `webapp/src/components/workflow/ProjectWorkspaceNew.tsx`

**Interfaces:**
- Consumes: `useWorkflow()` for current step routing
- Produces: `MainContent` (routes to correct step component), `ProjectWorkspaceNew` (Sidebar + MainContent wrapper)

---

### Task 8: Update API client and integrate Step1 → Step2

**Files:**
- Modify: `webapp/src/api/client.ts` (add/verify screenplay generation endpoint)
- Modify: `webapp/src/context/WorkflowContext.tsx` (implement generateScreenplay action)
- Test: `tests/workflow/WorkflowContext.test.tsx` (add API call test)

**Interfaces:**
- Consumes: Existing `/api/agent/run` endpoint (or create if missing)
- Produces: Real API call integration for screenplay generation

---

### Task 9: Implement Step2 → Step3 (beats generation)

**Files:**
- Modify: `webapp/src/api/client.ts` (add beat generation endpoint)
- Modify: `webapp/src/context/WorkflowContext.tsx` (implement approveScreenplay action)

**Interfaces:**
- Consumes: `/api/studio/beats` endpoint (or equivalent)
- Produces: Real API integration for beat generation

---

### Task 10: Implement Step3 → Step4 (image generation)

**Files:**
- Modify: `webapp/src/api/client.ts` (add image generation endpoint)
- Modify: `webapp/src/context/WorkflowContext.tsx` (implement approveStoryboard and pollVideoStatus)

---

### Task 11: Integrate NodeEditor with Step3

**Files:**
- Modify: `webapp/src/components/workflow/Step3ReviewStoryboard.tsx` (open NodeEditor on Edit)
- Integrate existing `NodeEditor.tsx` component

---

### Task 12: Update ProjectGrid to use new workflow (feature flag)

**Files:**
- Modify: `webapp/src/components/ProjectGrid.tsx` (add feature flag to switch UI)

---

### Task 13: Manual testing and integration

**Files:**
- Test: End-to-end manual testing
- Document: Brief testing checklist

---
