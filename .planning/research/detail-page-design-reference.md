# Design Reference: Project Detail Page

**Purpose:** Art direction spec for the project detail page shown when a user clicks a project card on the dashboard. This replaces the current horizontal-timeline-based detail view.

**Source:** Art direction review session, 2026-03-25. Interactive prototypes built and iterated in Claude.ai conversation.

## Current State

The current detail page has: a horizontal phase timeline (scrolls forever), a file sidebar listing phase docs, and a content pane rendering the selected markdown file. The timeline shows all phases as linear peers including sub-phases. Plan metadata renders as raw frontmatter text.

## Design Target: Three-Column Layout

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Dashboard    nitimini                      Branch: [dev ▾]    │
├────────────┬──────────────┬─────────────────────────────────────┤
│ Col 1      │ Col 2        │ Col 3                               │
│ Phase      │ Phase docs   │ Rendered document                   │
│ navigator  │ file list    │                                     │
│ (200px)    │ (180px)      │ (flex)                              │
│            │              │                                     │
│ Collapsible│              │ Metadata card (structured)          │
│ via toggle │              │ + rendered markdown body             │
│            │              │                                     │
└────────────┴──────────────┴─────────────────────────────────────┘
```

**Grid:** `grid-template-columns: 200px 180px minmax(0, 1fr)`
**When col 1 hidden:** `grid-template-columns: 0px 180px minmax(0, 1fr)` with CSS transition on grid-template-columns (~200ms ease)

### Column 1: Phase Navigator (collapsible)

A vertical list replacing the horizontal timeline entirely.

**Collapse toggle:** A `◀`/`▶` button at the top-left of column 2 (NOT column 1). When clicked, column 1 collapses to 0px with a CSS transition. The toggle flips to `▶` to restore it. The toggle button is 22px square, border-radius 4px, muted color, hover highlight.

**Completed phases section (collapsible):**
- Single row when collapsed: chevron + "N phases complete" text + dot strip on the right showing the branching shape (small dots for trunk phases, smaller dots for sub-phases, all in complete color)
- Click chevron/row to expand and see full list with sub-phases indented
- Collapsed by default on page load
- When expanded, each phase row shows: colored dot + phase number + slug name, all in muted/dimmed text

**Active and future phases section (always visible):**
- Below a horizontal divider (1px, border color)
- Each phase is a row: colored dot + phase number + slug name
- Selected phase has a 2px left border accent (accent color) and highlighted background (surface color)
- Sub-phases indented: depth 1 = padding-left 22px, depth 2 = padding-left 44px
- Dot sizes scale by plan count: 0 plans = 12px, 1-2 = 14px, 3-4 = 16px, 5+ = 20px
- Sub-phase dots are 4px smaller than trunk (minimum 8px)
- Plan counts shown on right side for phases with plans > 0
- Pending phases with 0 plans show nothing for plan count

**Connectors between rows:**
- 2px wide, 4-6px tall vertical bars between phase rows
- Complete color if preceding phase is complete, pending color otherwise
- Indented to match their depth level: depth 0 = margin-left 15px, depth 1 = margin-left 27px

### Column 2: Phase Docs File List

Shows the files for the currently selected phase from column 1.

**File grouping with separator:**
- Plans and summaries above a divider (paired: PLAN then SUMMARY for each plan number)
- Context, research, validation docs below the divider

**File status icons:**
- `▸` (accent color) for PLAN.md files
- `✓` (complete color) for SUMMARY.md files
- `◇` (muted color) for CONTEXT.md
- `◎` (muted color) for RESEARCH.md and VALIDATION.md

**Selected file:** 2px left border accent + highlighted background, same pattern as column 1 selection.

**Plan completion inference:** A plan is "done" if a corresponding SUMMARY.md exists (e.g., 07-01-PLAN.md is done if 07-01-SUMMARY.md exists). This is visual only — the icon pairing communicates it.

### Column 3: Rendered Document

Two sections:

**Metadata card (top, shown only for PLAN.md files):**
- Background: elevated surface color, border-radius 6px, padding 10px 14px
- Fields displayed inline in a flex row: Wave, Type, Depends On
- Field labels in muted text, values in primary text
- Requirements displayed as chips/badges: elevated background, 1px border, border-radius 4px, font-size 11px, primary text color
- The raw YAML frontmatter block (`---\n...\n---`) must be STRIPPED from the rendered markdown content — the metadata card replaces it entirely

**Rendered markdown body (below the card):**
- Standard markdown rendering via the existing `/render?path=...&fragment=true` endpoint
- Same typography and styling as the browse view content pane

### Header Bar

- "← Dashboard" link in accent color (returns to card view)
- Project name in bright text, font-weight 500
- Branch selector right-aligned — only shown when multiple branches have `.planning/`
- Branch dropdown styled: elevated background, border, border-radius 4px

## Interaction Flow

1. User clicks project card on dashboard → navigates to `#/project/<n>`
2. Detail page loads → column 1 shows phases with completed collapsed, auto-selects first in-progress phase (or last complete if none in-progress)
3. Column 2 populates with selected phase's files, auto-selects first file
4. Column 3 renders the selected file with metadata card (if PLAN.md)
5. User clicks different phase in col 1 → col 2 updates, auto-selects first file, col 3 updates
6. User clicks different file in col 2 → col 3 updates
7. User clicks `◀` → col 1 hides with transition, col 2+3 expand to fill
8. User clicks `▶` → col 1 reappears with transition
9. User changes branch dropdown → entire view reloads for that branch's `.planning/` state

## Color Tokens (theme-aware)

All colors MUST use CSS custom properties. Do NOT hardcode hex values for surfaces, text, or borders. Status colors are consistent across themes.

### Status colors (same for both themes)
| Token | Value | Purpose |
|-------|-------|---------|
| --status-complete | #3fb950 | Green — completed phases, summary icons |
| --status-active | #58a6ff | Blue — in-progress phases |
| --status-pending | (theme-dependent) | Gray — not-started phases |

### Surface/text tokens

| Token | Dark | Light | Purpose |
|-------|------|-------|---------|
| --bg-page | #0d1117 | #ffffff | Page background |
| --bg-surface | #161b22 | #f6f8fa | Panel backgrounds, selected rows |
| --bg-elevated | #21262d | #e1e4e8 | Borders, dividers, metadata card bg, chips |
| --text-bright | #f0f6fc | #24292f | Headings, selected phase names |
| --text-primary | #c9d1d9 | #3d4249 | Body text, chip text |
| --text-secondary | #8b949e | #656d76 | Labels, file names, metadata labels |
| --text-muted | #484f58 | #afb8c1 | Hints, completed-section text, meta icons |
| --accent | #58a6ff | #0969da | Links, active borders, plan file names |
| --status-pending | #484f58 | #afb8c1 | Pending dots, pending connectors |
| --border | #21262d | #d0d7de | Dividers, column borders |

### Implementation approach

```css
:root {
  --bg-page: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #21262d;
  --text-bright: #f0f6fc;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --accent: #58a6ff;
  --status-complete: #3fb950;
  --status-active: #58a6ff;
  --status-pending: #484f58;
  --border: #21262d;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg-page: #ffffff;
    --bg-surface: #f6f8fa;
    --bg-elevated: #e1e4e8;
    --text-bright: #24292f;
    --text-primary: #3d4249;
    --text-secondary: #656d76;
    --text-muted: #afb8c1;
    --accent: #0969da;
    --status-pending: #afb8c1;
    --border: #d0d7de;
  }
}
```

All CSS in the SPA must reference these tokens, never raw hex. The existing hardcoded colors (#0d1117, #161b22, etc.) in index.html need to be migrated to these tokens.

## Key Principles

1. The vertical navigator replaces horizontal scroll — scales to any number of phases without overflow
2. Sub-phases are indented, not peers — branching depth is unambiguous
3. Completed work collapses by default — the user cares about current and future, history is one click away
4. The metadata card is structured — no raw frontmatter dump in the content pane
5. Column 1 is hideable — once you know where you are, maximize doc reading space
6. File status is visual — plan/summary pairing communicates completion without reading the files
7. Theme-aware from the start — all colors via CSS custom properties, light theme via media query
