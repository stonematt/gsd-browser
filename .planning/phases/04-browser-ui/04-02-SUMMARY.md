---
phase: 04-browser-ui
plan: 02
subsystem: ui
tags: [spa, css-grid, hash-routing, dark-theme, file-tree, source-switcher]

# Dependency graph
requires:
  - phase: 04-browser-ui plan 01
    provides: GET /api/sources/:name/tree endpoint, fragment render mode (/render?fragment=true)
  - phase: 03-source-registration
    provides: GET /api/sources listing, MANAGEMENT_CSP for management pages

provides:
  - Three-panel SPA shell (header + sidebar + content) at GET /
  - File tree sidebar with expand/collapse, convention dir elevation, active file highlight
  - Source switcher dropdown populated from /api/sources
  - Hash-routed navigation (#/source-name/path/to/file.md) with back/forward support
  - Breadcrumb header showing current source and file path
  - Sidebar collapse toggle

affects:
  - 04.5-gsd-dashboard — same CSS patterns and API integration approach

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS Grid layout: grid-template-areas for three-panel shell with 44px header + 260px sidebar"
    - "body.sidebar-hidden toggles grid-template-columns: 0 1fr to collapse sidebar"
    - "Hash routing only (#/source/path) — no path-based URLs, no server round-trips for nav"
    - "history.pushState for navigateTo, history.replaceState for initial/switch loads"
    - "buildTreeNode() recursive DOM builder — textContent for all user content (XSS safe)"
    - "200ms loading timer guard: delayed indicator only if request takes >200ms"
    - "lastViewedFile Map: session memory per source for source-switching UX"
    - "treeData cached in module state; rebuilt entirely on every source switch (avoids data-path collisions)"
    - "setActiveFile() walks DOM ancestors to auto-expand parent dirs (VS Code pattern)"

key-files:
  created: []
  modified:
    - public/index.html
    - test/server.test.js

key-decisions:
  - "Single-file SPA with inline <style> and <script> — follows established pattern from sources.html, no build tooling needed"
  - "Rebuild entire #tree on source switch — prevents data-path attribute collisions across sources"
  - "history.replaceState (not pushState) for initial load and source switches — keeps back/forward clean"
  - "CSS.escape() in setActiveFile querySelector — safe for filenames with special chars"
  - "Convention dirs start expanded, non-convention start collapsed — matches user mental model"

patterns-established:
  - "Three-panel grid pattern: reusable for dashboard and other multi-pane layouts"
  - "Hash routing pattern: #/source-name/path/to/file.md — consistent deep-link format"

requirements-completed: [NAV-01, NAV-02, NAV-03, DSGN-01, DSGN-02]

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 4 Plan 02: SPA Browser Shell Summary

**Single-file three-panel SPA with CSS Grid layout, recursive file tree sidebar, hash routing, and GitHub dark theme — the primary Phase 4 user-facing deliverable**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-22T15:22:03Z
- **Completed:** 2026-03-22T15:23:57Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint — awaiting manual browser verification)
- **Files modified:** 2

## Accomplishments

- Complete rewrite of `public/index.html` as a single-file SPA with inline `<style>` and `<script>`
- CSS Grid three-panel layout: 44px header + 260px sidebar + content pane, all within `100vh` with no scroll leakage
- Source switcher dropdown fetches `/api/sources`, filters to available, populates with `name (path)` format
- Recursive file tree built via `buildTreeNode()` from `/api/sources/:name/tree` — convention dirs expanded by default, non-convention dirs collapsed
- Content pane loads rendered markdown via `/render?path=X&fragment=true`, injected as innerHTML
- Hash routing with `history.pushState`/`popstate` for back/forward navigation and deep-linking
- Active file highlighted in sidebar tree with auto-expansion of ancestor directories (VS Code pattern)
- Sidebar collapse/expand toggle button in header
- Breadcrumb nav in header shows `source / path / segments / file.md`
- 6 new NAV-03 smoke tests added; all 56 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the three-panel SPA shell** - `da5ef72` (feat)

**Plan metadata:** (pending — will be committed after checkpoint)

## Files Created/Modified

- `public/index.html` — Complete SPA rewrite: CSS Grid layout, file tree, source switcher, hash routing, content pane
- `test/server.test.js` — 6 new NAV-03 smoke tests for SPA HTML structure

## Decisions Made

- **Single-file SPA pattern:** Inline `<style>` and `<script>` in a single HTML file, following the same pattern as the existing `sources.html`. No build tooling, no external JS assets, consistent with project philosophy.
- **Rebuild tree on source switch:** `#tree` container is cleared and rebuilt from scratch on every source switch. This avoids `data-path` attribute collisions that would occur if two sources had files at the same relative path.
- **history.replaceState for initial loads:** Using `replaceState` (not `pushState`) for the initial page load and source-switch default file loads keeps the browser history clean — only explicit file clicks add entries.
- **CSS.escape() for querySelector:** `setActiveFile()` uses `CSS.escape(filePath)` in the attribute selector to safely handle filenames with special characters (dots, brackets, spaces).
- **200ms loading guard:** A `setTimeout(..., 200)` prevents a loading indicator flash for fast responses while still showing feedback for slow requests.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- SPA shell is built and all automated tests pass
- **Awaiting:** Human browser verification (Task 2 checkpoint) to confirm visual and functional correctness
- After verification: ready for Phase 4.5 (GSD Dashboard)

---
*Phase: 04-browser-ui*
*Completed: 2026-03-22*
