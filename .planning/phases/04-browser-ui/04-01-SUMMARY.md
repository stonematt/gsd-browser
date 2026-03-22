---
phase: 04-browser-ui
plan: 01
subsystem: api
tags: [fastify, node-fs, tree-api, fragment-rendering, markdown-it]

# Dependency graph
requires:
  - phase: 03-source-registration
    provides: activeSources in createServer closure, listSources(), source management REST API

provides:
  - GET /api/sources/:name/tree endpoint returning recursive .md-only JSON tree with convention flags
  - fragment=true option on GET /render returning markdown-body div without full page boilerplate
  - buildTree() recursive function with convention-dir detection and sort ordering

affects:
  - 04-browser-ui (plans 02+) — SPA frontend depends on tree endpoint for sidebar, fragment mode for content pane
  - 04.5-gsd-dashboard — dashboard may use tree API for project file navigation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildTree() uses activeSources (not listSources()) to stay consistent with /file and /render routes"
    - "Convention dir detection via CONVENTION_DIRS Set — easy to extend"
    - "Sort: convention dirs first, then non-convention dirs, then files, each group alphabetical"

key-files:
  created: []
  modified:
    - src/server.js
    - src/renderer.js
    - test/server.test.js

key-decisions:
  - "Tree endpoint uses activeSources (server closure) not listSources() (config) — matches pattern of /file and /render routes"
  - "CONVENTION_DIRS is a Set at module level (not per-request) for easy future extension"
  - "fragment=false default preserves backward compatibility with all existing /render callers"
  - "buildTree() returns empty array for unreadable dirs (silent skip) — tolerates filesystem race conditions"

patterns-established:
  - "TDD red-green: write all failing tests first, then implement, then verify all pass"
  - "Phase 4 test fixtures added to shared before() hook in server.test.js"

requirements-completed: [NAV-01, NAV-02]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 4 Plan 01: Tree API and Fragment Mode Summary

**Recursive .md-only file tree endpoint (/api/sources/:name/tree) and fragment render mode (/render?fragment=true) for SPA frontend consumption**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T00:37:07Z
- **Completed:** 2026-03-22T00:40:02Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments

- Added `buildTree()` recursive function: scans .md files only, omits directories with no .md descendants, marks `.planning` and `docs` as convention dirs, sorts convention dirs first then alphabetical
- Added `GET /api/sources/:name/tree` endpoint returning `{ source, tree }` JSON with full recursive node shape
- Added `fragment=true` option to `buildPage()` returning just the `<div class="markdown-body">` content without full HTML page wrapper
- Wired `?fragment=true` query param in `/render` route handler
- 12 new tests added, all 50 tests pass (no regressions in 38 existing tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests for tree API and fragment mode** - `e0905af` (test)
2. **Task 1 GREEN: Implement tree endpoint and fragment mode** - `dd32278` (feat)

## Files Created/Modified

- `src/server.js` - Added `CONVENTION_DIRS` constant, `buildTree()` function, `/api/sources/:name/tree` route, fragment query param in `/render` handler
- `src/renderer.js` - Added `fragment=false` parameter to `buildPage()`, returns `bodyHtml` directly when `fragment=true`
- `test/server.test.js` - Added Phase 4 fixtures to shared `before()` hook, 12 new NAV-01/NAV-02 tests

## Decisions Made

- **Tree endpoint uses `activeSources` (not `listSources()`):** The tree endpoint uses the in-memory `activeSources` from the createServer closure, consistent with how `/file` and `/render` routes operate. Using `listSources()` (config-based) would fail in tests that use `createServer(makeSources(...))` directly without a real config file.
- **`CONVENTION_DIRS` as module-level Set:** Defined at module level (not per-request) for clarity and easy extension. Currently contains `.planning` and `docs` per spec.
- **`fragment=false` default:** Preserves full backward compatibility — all existing `/render` callers get full HTML pages unchanged.
- **Silent skip for unreadable dirs:** `buildTree()` catches stat/readdir errors and returns empty array, tolerating filesystem edge cases without crashing.

## Deviations from Plan

None — plan executed exactly as written, with one minor auto-fix:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tree endpoint used listSources() instead of activeSources**
- **Found during:** Task 1 GREEN (first test run after implementation)
- **Issue:** Plan specified `listSources()` in the route handler, but tests use `createServer(makeSources(...))` pattern where activeSources is set from the constructor argument, not from a config file. Using `listSources()` caused 404 for valid sources in tests.
- **Fix:** Changed route to use `activeSources.find(s => s.name === sourceName)` — matches the established pattern from `/file` and `/render` routes
- **Files modified:** src/server.js
- **Verification:** All 7 tree endpoint tests pass
- **Committed in:** dd32278 (GREEN implementation commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug, plan spec didn't account for test pattern)
**Impact on plan:** Essential fix for correctness. The implementation described in the plan would have broken tests; activeSources is the correct approach.

## Issues Encountered

None beyond the auto-fixed deviation above.

## Next Phase Readiness

- Tree API ready for SPA sidebar consumption (`/api/sources/:name/tree`)
- Fragment render mode ready for SPA content pane injection (`/render?path=X&fragment=true`)
- Both use strict CSP (script-src 'none') — no changes needed for security model
- Ready for Phase 4 Plan 02: SPA frontend implementation

---
*Phase: 04-browser-ui*
*Completed: 2026-03-22*
