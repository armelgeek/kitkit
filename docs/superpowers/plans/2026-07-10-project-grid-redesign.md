# Project Grid UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine ProjectGrid component with SaaS premium aesthetics — refined spacing, elevated visual hierarchy, enriched metadata, and smooth interactions.

**Architecture:** Single-file refactor of `ProjectGrid.tsx`. All changes are CSS class updates, metadata display enhancements, and styling tweaks. No new components, no API changes, no new dependencies.

**Tech Stack:** React + Tailwind CSS (existing). Uses `updated_at` from Project model for date display (note: `created_at` not present in current Project interface; `target_duration` used for duration metadata).

## Global Constraints

- **File touched:** `webapp/src/components/ProjectGrid.tsx` only
- **No breaking changes** — Project interface unchanged
- **Dark theme maintained** — no light mode additions
- **Tailwind only** — no new CSS files or dependencies
- **Responsive grid structure** preserved — breakpoints unchanged (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- **Date format:** `YYYY-MM-DD` from `updated_at` (Unix timestamp → formatted string)
- **Duration:** `target_duration` in seconds → humanized (e.g., "8 min")

---

## File Structure

**Single modified file:**
- `webapp/src/components/ProjectGrid.tsx` — Main grid component with all UI changes

No new files created. All changes are within the existing component.

---

## Tasks

### Task 1: Update page container and header styling

**Files:**
- Modify: `webapp/src/components/ProjectGrid.tsx:83-116` (page container, header, title, buttons)

**Interfaces:**
- Consumes: `Project[]` (from existing state)
- Produces: Styled header with `text-3xl` title, refined buttons with `gap-3` and `py-2.5`

**Steps:**

- [ ] **Step 1: Update page container padding**

Replace:
```tsx
<div className="mx-auto max-w-7xl px-6 py-8">
```

With:
```tsx
<div className="mx-auto max-w-7xl px-6 py-12">
```

- [ ] **Step 2: Update header title font size**

Replace:
```tsx
<h1 className="text-2xl font-semibold">Projects</h1>
```

With:
```tsx
<h1 className="text-3xl font-semibold">Projects</h1>
```

- [ ] **Step 3: Update button container gap and button padding**

Replace:
```tsx
<div className="flex gap-2">
  <label
    title="Import a project from an exported .zip file"
    className="cursor-pointer rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
  >
    {importing ? "Importing…" : "⬆ Import .zip"}
    <input
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      disabled={importing}
      onChange={(e) => importZip(e.target.files?.[0])}
    />
  </label>
  <button
    onClick={loadFlow}
    className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
  >
  Import from Flow
  </button>
  <button
    onClick={() => setCreating(true)}
    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
  >
    + New project
  </button>
</div>
```

With:
```tsx
<div className="flex gap-3">
  <label
    title="Import a project from an exported .zip file"
    className="cursor-pointer rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors duration-150"
  >
    {importing ? "Importing…" : "⬆ Import .zip"}
    <input
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      disabled={importing}
      onChange={(e) => importZip(e.target.files?.[0])}
    />
  </label>
  <button
    onClick={loadFlow}
    className="rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors duration-150"
  >
  Import from Flow
  </button>
  <button
    onClick={() => setCreating(true)}
    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors duration-150"
  >
    + New project
  </button>
</div>
```

- [ ] **Step 4: Commit header styling changes**

```bash
git add webapp/src/components/ProjectGrid.tsx
git commit -m "refactor: update page header and button styling (premium spacing)"
```

---

### Task 2: Update project grid card container and styling

**Files:**
- Modify: `webapp/src/components/ProjectGrid.tsx:153-188` (card div and card footer)

**Interfaces:**
- Consumes: `projects` array with Project items
- Produces: Cards with `bg-neutral-900/70`, `shadow-sm`, `rounded-xl`, `p-4`, and transition-shadow

**Steps:**

- [ ] **Step 1: Update card container styling**

Replace:
```tsx
<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {projects.map((p) => (
    <div
      key={p.id}
      className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 transition hover:border-neutral-600"
    >
```

With:
```tsx
<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {projects.map((p) => (
    <div
      key={p.id}
      className="group overflow-hidden rounded-xl bg-neutral-900/70 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
```

- [ ] **Step 2: Update thumbnail button styling**

Replace:
```tsx
            <button onClick={() => onOpen(p)} className="block w-full text-left">
              <Thumb
                src={p.thumb_media_key ? thumbUrl(p.thumb_media_key) : null}
                alt={p.title}
                rounded="rounded-none"
                className="aspect-video w-full"
              />
            </button>
```

With:
```tsx
            <button onClick={() => onOpen(p)} className="block w-full text-left">
              <Thumb
                src={p.thumb_media_key ? thumbUrl(p.thumb_media_key) : null}
                alt={p.title}
                rounded="rounded-none"
                className="aspect-video w-full"
              />
            </button>
```

(Thumbnail remains unchanged; just confirm no scaling on hover)

- [ ] **Step 3: Update card footer padding and layout**

Replace:
```tsx
            <div className="flex items-center justify-between gap-2 p-3">
              <button onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{p.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{p.style}</span>
                  {p.storytelling ? (
                    <span className="rounded bg-amber-500/15 px-1.5 text-amber-300">
                      storytelling
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                onClick={() => remove(p)}
                title="Delete"
                className="rounded-md p-1.5 text-neutral-500 opacity-0 transition hover:bg-neutral-800 hover:text-rose-400 group-hover:opacity-100"
              >
                🗑
              </button>
            </div>
```

With (to be replaced in next step with metadata):
```tsx
            <div className="flex flex-col gap-2 p-4">
              <button onClick={() => onOpen(p)} className="text-left">
                <div className="truncate font-semibold text-base text-white">{p.title}</div>
              </button>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                  <span>{p.style}</span>
                  {p.storytelling ? (
                    <>
                      <span> • </span>
                      <span className="rounded bg-amber-500/15 px-1.5 text-amber-300 inline">
                        storytelling
                      </span>
                    </>
                  ) : null}
                  <span> • </span>
                  <span>{new Date(p.updated_at * 1000).toISOString().split('T')[0]}</span>
                  {p.target_duration && (
                    <>
                      <span> • </span>
                      <span>{Math.round(p.target_duration / 60)} min</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => remove(p)}
                  title="Delete"
                  className="rounded-md p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150 flex-shrink-0"
                >
                  🗑
                </button>
              </div>
            </div>
```

- [ ] **Step 4: Commit card styling and metadata changes**

```bash
git add webapp/src/components/ProjectGrid.tsx
git commit -m "refactor: update card styling with metadata line and refined delete button"
```

---

### Task 3: Verify metadata display and edge cases

**Files:**
- Modify: `webapp/src/components/ProjectGrid.tsx` (verify the metadata rendering works correctly)

**Interfaces:**
- Consumes: Project with `updated_at`, `target_duration`, `storytelling`
- Produces: Formatted metadata line with date (YYYY-MM-DD) and duration (min)

**Steps:**

- [ ] **Step 1: Check date formatting works (manual inspection)**

The metadata line now shows:
```
Style • [Storytelling] • YYYY-MM-DD • X min
```

Verify that:
- `new Date(p.updated_at * 1000).toISOString().split('T')[0]` produces correct YYYY-MM-DD format
- If `storytelling` is false, the badge and bullet are skipped
- If `target_duration` is null, the duration and bullet are skipped

- [ ] **Step 2: Verify truncation on long metadata**

Add a manual test project with a very long style name or title:
```bash
# In browser console, or test the app:
# Create a project with style "Hyper Realistic Ultra Detailed Cinematic Narrative Style"
# Verify metadata line truncates with ellipsis, not wrap
```

The `truncate` class on the flex item should handle this.

- [ ] **Step 3: Commit verification notes** (no code change)

```bash
# No commit needed; this is a verification step
```

---

### Task 4: Update modal styling for consistency

**Files:**
- Modify: `webapp/src/components/ProjectGrid.tsx:248-320` (CreateModal)

**Interfaces:**
- Consumes: Modal state and form inputs
- Produces: Modal with refined button styling (transition-colors, py-2.5 buttons)

**Steps:**

- [ ] **Step 1: Update CreateModal button styling**

Replace:
```tsx
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
```

With:
```tsx
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors duration-150"
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
```

- [ ] **Step 2: Commit modal styling updates**

```bash
git add webapp/src/components/ProjectGrid.tsx
git commit -m "refactor: add smooth transitions to modal buttons"
```

---

### Task 5: Test responsive design and interactions

**Files:**
- Test: `webapp/src/components/ProjectGrid.tsx` (manual testing)

**Interfaces:**
- Consumes: UI changes from Tasks 1-4
- Produces: Verified working component at all breakpoints

**Steps:**

- [ ] **Step 1: Test desktop layout (1920px+)**

Open browser DevTools, viewport: 1920x1080
- [ ] Verify grid shows 4 columns (`xl:grid-cols-4`)
- [ ] Verify cards have proper `gap-6` spacing
- [ ] Verify card shadow is subtle (`shadow-sm`)
- [ ] Hover over a card → shadow should lift to `shadow-md` (smooth transition)
- [ ] Verify delete button is always visible (not hidden)
- [ ] Metadata line shows: Style • [Storytelling if active] • Date • Duration

- [ ] **Step 2: Test tablet layout (768px)**

Resize to 1024x768 (iPad size)
- [ ] Verify grid shows 3 columns (`lg:grid-cols-3`)
- [ ] Verify spacing and shadows are consistent
- [ ] Test metadata truncation if style name is very long

- [ ] **Step 3: Test mobile layout (mobile portrait)**

Resize to 375x667 (iPhone 12)
- [ ] Verify grid shows 1 column (`grid-cols-1`)
- [ ] Verify card is full width with proper padding
- [ ] Verify metadata truncates properly
- [ ] Verify delete button is still usable (tap-friendly, `p-2` padding)

- [ ] **Step 4: Test interactions**

- [ ] Hover over delete button → color changes to rose-400, background to rose-500/10 (smooth)
- [ ] Hover over "Import .zip" button → background changes to neutral-800 (smooth)
- [ ] Hover over "New project" button → background changes to indigo-500 (smooth)
- [ ] Click delete button → confirm modal appears
- [ ] Click card → opens project

- [ ] **Step 5: Test empty state**

Create/delete all projects to show empty state
- [ ] Verify placeholder text is displayed: "No projects yet. Click **+ New project** to get started."
- [ ] Verify styling is unchanged from current

- [ ] **Step 6: Test Import from Flow**

- [ ] Click "Import from Flow" → section expands
- [ ] Verify section styling is unchanged (already good)
- [ ] Click "Import from Flow" again → section collapses

- [ ] **Step 7: Manual testing checklist — capture in browser**

Open app at `http://127.0.0.1:8100` (or your dev server)
```bash
# Start dev server:
cd /home/armel/dev/Hayzar/video/flowkit/webapp
npm run dev

# Open in browser, navigate to Projects page
# Verify all steps above
```

- [ ] **Step 8: No commit needed for manual testing**

This is a verification step. If any issues found, create new tasks to fix.

---

### Task 6: Handle missing `created_at` field and finalize

**Files:**
- Document: Note in code that `updated_at` is used instead of `created_at`

**Interfaces:**
- Consumes: `Project.updated_at` (Unix timestamp)
- Produces: Date formatted as YYYY-MM-DD in metadata

**Steps:**

- [ ] **Step 1: Add comment noting date field usage**

In the metadata line rendering, add a comment:
```tsx
{/* Note: using updated_at (Project has no created_at field) */}
<span>{new Date(p.updated_at * 1000).toISOString().split('T')[0]}</span>
```

- [ ] **Step 2: Verify all changes are complete**

Review the diff:
```bash
git diff HEAD~6..HEAD
```

Checklist:
- [ ] Page padding: `py-12` ✓
- [ ] Title size: `text-3xl` ✓
- [ ] Button gap: `gap-3` ✓
- [ ] Button padding: `py-2.5` ✓
- [ ] Button borders: `border-neutral-600` ✓
- [ ] Card gap: `gap-6` ✓
- [ ] Card background: `bg-neutral-900/70` ✓
- [ ] Card border: removed (shadow only) ✓
- [ ] Card shadow: `shadow-sm` → `shadow-md` on hover ✓
- [ ] Card rounded: `rounded-xl` ✓
- [ ] Card padding: `p-4` ✓
- [ ] Metadata line: present with Style • Storytelling • Date • Duration ✓
- [ ] Delete button: always visible, styled, `p-2` ✓
- [ ] Hover transitions: `transition-colors duration-150` and `transition-shadow duration-200` ✓
- [ ] Modal buttons: transitions added ✓

- [ ] **Step 3: Final commit**

```bash
git add webapp/src/components/ProjectGrid.tsx
git commit -m "refactor: finalize project grid SaaS premium redesign

- Refined spacing throughout (page, cards, buttons)
- Elevated card styling with shadow-only borders
- Enriched metadata line with date and duration
- Made delete button always visible
- Added smooth transitions for premium feel
- Maintained responsive grid structure
- No API changes, uses existing Project fields"
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd /home/armel/dev/Hayzar/video/flowkit/webapp
npm run build
```

Expected: No TypeScript errors, build succeeds.

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ Cards: background, border → shadow, rounded, padding
- ✅ Metadata: style, storytelling badge, date, duration
- ✅ Typography: title size, metadata styling
- ✅ Spacing: page, grid, buttons, cards
- ✅ Interactions: card hover shadow, delete button styling, button transitions
- ✅ Delete button: always visible, improved styling
- ✅ Responsive: grid breakpoints preserved

**Placeholder Check:**
- ✅ No "TBD" or "TODO"
- ✅ All code blocks complete with actual implementation
- ✅ All commands shown with expected output
- ✅ No "similar to" references
- ✅ No vague instructions

**Type Consistency:**
- ✅ `Project.updated_at` (number) → converted to ISO date string
- ✅ `Project.target_duration` (number | null) → humanized as "X min"
- ✅ `Project.storytelling` (number) → used as boolean (`!!p.storytelling`)
- ✅ All references consistent across tasks

**Data Requirements:**
- ✅ `Project.updated_at` exists and used (not `created_at`, which doesn't exist)
- ✅ `Project.target_duration` used for duration (may be null, handled)
- ✅ No breaking API changes

---

