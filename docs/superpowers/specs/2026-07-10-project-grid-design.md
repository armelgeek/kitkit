# Project Grid UI Redesign — SaaS Premium Polish

**Date:** 2026-07-10  
**Status:** Design Specification  
**Component:** `ProjectGrid.tsx`  
**Goal:** Refine existing grid layout with SaaS premium aesthetics (Figma/Superhuman style) — minimal but highly polished.

---

## Design Direction

**Current issue:** UI is too minimaliste, lacks visual richness and sophistication.

**Target:** Premium SaaS look — maintain grid structure, add refined details, subtle depth, enriched metadata, and smooth interactions.

**Approach:** Hybrid of Refined Minimalism (Figma-style polish) + Elevated Visual Hierarchy (metadata + subtle visual depth).

---

## Visual Design

### Cards

**Structure:**
```
┌──────────────────────────────┐
│                              │
│     Thumbnail (60%)          │
│   (aspect-video ratio)       │
│                              │
├──────────────────────────────┤
│ Title (larger)               │
│ Style • Storytelling • Date  │
│                          🗑️   │  (delete always visible)
└──────────────────────────────┘
```

**Styling:**
- **Background:** `bg-neutral-900/70` (more opaque, elevated feel vs. current `/50`)
- **Border:** None — use shadow only
- **Shadow:** `shadow-sm` at rest, `shadow-md` on hover
- **Rounded corners:** `rounded-xl` (slightly sharper than current `rounded-2xl`, more refined)
- **Padding:** `p-4` (up from `p-3`, more generous)
- **Overflow:** `overflow-hidden` (keep clipping thumbnail)

**Thumbnail:**
- Aspect ratio: `aspect-video` (keep)
- Full width, no rounded corners at top (clipped by card border)
- No hover scale or transform (SaaS premium doesn't animate scale)

**Card footer (metadata zone):**
- Flex row: title left, delete button right
- **Min-width on title:** `min-w-0` (allow truncation if delete button present)

### Metadata Section (NEW)

**Title line:**
- Font: `font-semibold text-base` (larger than current, more prominent)
- Color: `text-white` (keep)
- Truncate if too long

**Metadata line (NEW):**
```
Style • [Storytelling] • 2026-07-10 • 8 min
```
- All on one line, no wrapping
- Separator: `•` (bullet, non-intrusive)
- Font: `text-xs text-neutral-500` (subtle)
- Content:
  - **Style:** Project style (e.g., "Realistic")
  - **Storytelling badge:** `rounded bg-amber-500/15 px-1.5 text-amber-300` (if `storytelling: true`)
  - **Date:** Created date, format `YYYY-MM-DD`
  - **Duration:** Approx project duration (e.g., "8 min") — *to be calculated or stored in Project model*
- **Truncate:** If line too long, truncate with `truncate` class

**Delete button:**
- **Always visible** (not hidden on hover like current)
- Position: bottom-right of card footer
- Icon: `🗑` (keep)
- Styling: `rounded-md p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150`
- Larger hit area (`p-2` vs current `p-1.5`)

---

## Layout & Spacing

**Page container:**
- Max width: `max-w-7xl` (keep)
- Padding: `px-6 py-12` (up from `py-8`, more generous top/bottom)

**Header section:**
- Flex between title + buttons
- Gap between elements: standard spacing maintained

**Title:**
- Font: `text-3xl font-semibold` (up from `text-2xl`, more imposing)
- Subtitle: `text-sm text-neutral-400` (keep)

**Button actions:**
- Container: `flex gap-3` (up from `gap-2`, more space between buttons)
- All buttons: `rounded-lg px-4 py-2.5` (up from `py-2`, better proportions)
- **Import .zip:** Secondary button styling
- **Import from Flow:** Secondary button styling
- **New project:** Primary button (`bg-indigo-600 hover:bg-indigo-500`)
- Border on secondary buttons: `border border-neutral-600` (up from `border-neutral-700`, higher contrast)

**Grid container:**
- Responsive: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Gap: `gap-6` (up from `gap-5`, more air)

**Error message:**
- Keep current styling (rose border + bg)
- Font: `text-sm`

---

## Interactions

**Card hover:**
- **Shadow transition:** `shadow-sm` → `shadow-md` (subtle lift effect)
- **Transition class:** `transition-shadow duration-200` (smooth 200ms)
- **NO scale transform** (SaaS premium aesthetic avoids scaling on hover)
- Border remains invisible

**Delete button hover:**
- Color: `text-neutral-400` → `text-rose-400`
- Background: transparent → `bg-rose-500/10`
- Transition: `transition-colors duration-150` (smooth color change)

**Button hover (action buttons):**
- **Primary:** `bg-indigo-600` → `bg-indigo-500`
- **Secondary:** `border-neutral-600 bg-transparent` → `bg-neutral-800`
- Transition: `transition-colors duration-150`

---

## Import from Flow Section (refined)

**Styling updates:**
- **Container:** `rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4`
- Keep as-is (already good structure)

**Grid of Flow projects:**
- Responsive: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (keep)
- Gap: `gap-3` (keep)

---

## Empty State

**No projects placeholder:**
- `rounded-2xl border border-dashed border-neutral-800 py-16 text-center text-neutral-500`
- Keep styling
- Consider: add subtle icon or visual?

---

## New Project Modal

**Keep current structure**, refine styling:
- Modal: `rounded-2xl border border-neutral-800 bg-neutral-900 p-6`
- Title: `text-lg font-semibold` (keep)
- Labels: `text-xs text-neutral-400` (keep)
- Inputs: `rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm`
- Buttons:
  - Cancel: `text-neutral-300 hover:bg-neutral-800`
  - Create: `bg-indigo-600 hover:bg-indigo-500`
- Transition: `transition-colors duration-150`

---

## Data Requirements

**Project model needs (if not already present):**
- `created_at` — for date display
- `duration` (optional) — approx video duration in seconds (calculate or store)

If `duration` not available, show only `Style • Storytelling • Date`.

---

## Summary of Changes

| Element | Current | New | Impact |
|---------|---------|-----|--------|
| Card background | `bg-neutral-900/50` | `bg-neutral-900/70` | More opaque, elevated |
| Card border | Yes, `border-neutral-800` | No, shadow only | Cleaner, premium feel |
| Card shadow | Subtle | `shadow-sm` → `shadow-md` on hover | Better depth |
| Card rounded | `rounded-2xl` | `rounded-xl` | More refined |
| Card padding | `p-3` | `p-4` | Generous spacing |
| Title size | `text-base` | `text-base` (no change) | — |
| Metadata line | None | NEW: Style • Storytelling • Date • Duration | Richer info |
| Delete button | Hidden on hover | Always visible | Better discoverability |
| Grid gap | `gap-5` | `gap-6` | More air |
| Page padding | `py-8` | `py-12` | Generous spacing |
| Title size | `text-2xl` | `text-3xl` | More imposing |
| Button styling | `border-neutral-700` | `border-neutral-600` | Better contrast |

---

## Scope & Constraints

- **Grid structure:** Unchanged (responsive breakpoints kept)
- **Dark theme:** Maintained throughout
- **No new dependencies:** Uses Tailwind only
- **Backward compatible:** No breaking API changes
- **File touched:** `webapp/src/components/ProjectGrid.tsx`

---

## Testing Notes

- Verify metadata truncation on long titles/styles
- Test delete button visibility and click accuracy
- Check hover shadow transitions across browsers
- Responsive grid at all breakpoints (mobile, tablet, desktop, ultra-wide)
- Empty state appearance
- Modal creation flow styling

