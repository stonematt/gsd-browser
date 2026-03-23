---
phase: 03-source-registration
plan: 03
subsystem: rest-api+web-ui
tags: [node, cjs, fastify, rest-api, csp, source-management]

# Dependency graph
requires:
  - phase: 03-source-registration
    plan: 01
    provides: src/sources.js with addSource, removeSource, listSources
  - phase: 03-source-registration
    plan: 02
    provides: Multi-source server architecture, activeSources mutable reference

provides:
  - src/server.js: REST API endpoints (GET/POST/DELETE/PATCH /api/sources), /sources management page route, per-route CSP overrides
  - public/sources.html: Standalone management page with add/edit/remove functionality and dark theme
  - test/server.test.js: Integration tests for all API endpoints and CSP differentiation

affects:
  - 04-ui-shell (source management page becomes part of full UI shell)
  - 05-navigation (api/sources and /api/sources/:name/files endpoints used for navigation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-route onSend hook overrides global CSP_HEADER for management routes"
    - "activeSources mutable reference updated after add/remove to reflect changes without restart"
    - "withTempConfig() helper sets XDG_CONFIG_HOME per-test to isolate API tests from real config"
    - "MANAGEMENT_CSP relaxed to allow 'self' and 'unsafe-inline' scripts/styles for embedded page JS"

key-files:
  created:
    - public/sources.html
  modified:
    - src/server.js
    - test/server.test.js

key-decisions:
  - "Per-route CSP override via onSend hook — global preHandler sets CSP_HEADER on all responses, per-route onSend overrides for /sources and /api/sources"
  - "activeSources stored as mutable variable in createServer closure, updated after successful add/remove operations"
  - "withTempConfig() sets XDG_CONFIG_HOME in process.env for test isolation rather than passing configPath to API functions"
  - "Extra routes added beyond plan: PATCH /api/sources/:name (edit) and GET /api/sources/:name/files (file listing) — used by the management page"

requirements-completed: [SRC-06]

# Metrics
duration: <1min (implementation already present from prior session)
completed: 2026-03-20
---

# Phase 3 Plan 03: REST API and Web UI Management Summary

**REST API endpoints for source management, standalone /sources management page with per-route CSP relaxation**

## Performance

- **Duration:** <1 min (implementation verified)
- **Started:** 2026-03-20
- **Completed:** 2026-03-20
- **Tasks:** 1 (verification + summary)
- **Files modified:** 2 (server.js, test/server.test.js), 1 created (sources.html)

## Accomplishments

- GET /api/sources returns JSON array of all registered sources with name, path, available, conventions
- POST /api/sources with { path, name? } adds source, returns 201 or 409 for duplicate
- DELETE /api/sources/:identifier removes source by name or path, returns 200/404/409
- PATCH /api/sources/:name updates source name or path
- GET /api/sources/:name/files returns markdown files grouped by convention (readme, planning, docs, other)
- /sources page loads as standalone dark-themed management UI with add/edit/remove
- Per-route CSP: MANAGEMENT_CSP (`script-src 'self' 'unsafe-inline'`) for /sources and /api/sources; strict CSP_HEADER (`script-src 'none'`) for /render and /file
- 82 tests pass (7 new SRC-06 API tests added)

## Files Created/Modified

- `public/sources.html` — 551-line standalone management page with add form, sources table, edit modal, remove buttons, all wired to REST API
- `src/server.js` — Added GET/POST/DELETE/PATCH /api/sources routes, GET /api/sources/:name/files, GET /sources, per-route CSP overrides, activeSources mutable reference
- `test/server.test.js` — Added 7 SRC-06 integration tests for API endpoints and CSP differentiation

## Decisions Made

- **Per-route CSP via onSend hook:** Global `preHandler` sets `CSP_HEADER` on all responses; management routes override via `onSend` to set `MANAGEMENT_CSP`
- **Active sources mutable reference:** `let activeSources = sources` in createServer scope, updated after add/remove so /file and /render serve current state without restart
- **Extra routes beyond plan:** PATCH /api/sources/:name and GET /api/sources/:name/files added for management page use — natural extensions of the management API

## Deviations from Plan

None — implementation matches plan exactly.

## Issues Encountered

None. All 82 tests pass, CSP differentiation verified, API endpoints functional.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full source management system complete: CLI (add/remove/list) + REST API + web UI
- All six SRC requirements satisfied
- Ready for Phase 4: UI Shell with navigation sidebar

---
*Phase: 03-source-registration*
*Completed: 2026-03-20*
