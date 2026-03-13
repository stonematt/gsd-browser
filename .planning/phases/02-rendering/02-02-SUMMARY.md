---
phase: 02-rendering
plan: 02
subsystem: rendering
tags: [fastify-static, markdown-rendering, http-routes, path-traversal, csp, cache-control]

# Dependency graph
requires:
  - phase: 02-rendering-plan-01
    provides: src/renderer.js initRenderer/renderMarkdown/buildPage, public/styles/markdown.css
  - phase: 01-foundation
    provides: src/filesystem.js isPathAllowed/readFileIfAllowed, src/server.js Fastify server skeleton

provides:
  - "GET /render?path=<file.md> returns full styled HTML page with rendered markdown"
  - "GET / renders README.md if present, or falls back to directory listing JSON"
  - "GET /styles/markdown.css serves CSS from public/ via @fastify/static"
  - "Path traversal protection (403) on /render route"
  - "CSP and Cache-Control headers on all /render responses"

affects:
  - 04-ui-shell (will extend HTML page structure and CSS from buildPage)
  - 05-navigation (will use /render for browsing)
  - 06-config (may need to adjust static file paths)

# Tech tracking
tech-stack:
  added:
    - "@fastify/static ^9 (registered for public/ directory at / prefix)"
  patterns:
    - "Register @fastify/static BEFORE defining routes to avoid route shadowing pitfalls"
    - "path.resolve(realBase, requestedPath) for traversal detection without requiring file to exist"
    - "isPathAllowed check on root-resolved path, then readFileIfAllowed for content"
    - "initRenderer() called in start() before fastify.listen() — init before accepting requests"
    - "initRenderer() also called in test before() hook for fastify.inject() bypass compatibility"

key-files:
  created:
    - test/server.test.js (additions for /render, /, /styles routes — 13 new tests)
  modified:
    - src/server.js (added /render route, / route, @fastify/static registration, initRenderer in start)

key-decisions:
  - "Register @fastify/static before routes to prevent prefix matching issues (per research pitfall 7)"
  - "decorateReply: false on @fastify/static to prevent conflict with existing reply.send usage"
  - "Path traversal check uses path.resolve(realBase, requestedPath) without fs.realpath on target — enables 403 vs 404 distinction for non-existent paths"
  - "readFileIfAllowed returning null after traversal check = 404 (file allowed but missing)"
  - "CSP kept as script-src none for now — Mermaid SVGs inline styles degrade to unstyled diagrams (acceptable for Phase 2)"

patterns-established:
  - "Pattern: Static file registration before route definitions in Fastify"
  - "Pattern: Two-layer path check — fast sync resolve() for traversal, then isPathAllowed/readFileIfAllowed for actual read"
  - "Pattern: initRenderer() in both start() and test before() hooks for server vs inject() contexts"

requirements-completed: [SERV-02, SERV-03, REND-01, REND-02]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 2 Plan 02: Server Route Integration Summary

**Fastify /render route wired to renderer pipeline with @fastify/static CSS serving, path traversal protection, and root / README fallback — 47 tests green**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-13T20:32:56Z
- **Completed:** 2026-03-13T20:35:30Z
- **Tasks:** 1 of 2 complete (Task 2 is a checkpoint awaiting visual verification)
- **Files modified:** 2 (src/server.js modified, test/server.test.js extended)

## Accomplishments

- `src/server.js` now registers `@fastify/static` serving `public/` at `/` prefix — CSS available at `/styles/markdown.css`
- GET `/render?path=<file>` route: validates path, blocks traversal with 403, returns full HTML page via `renderMarkdown` + `buildPage`
- GET `/` route: renders `README.md` as HTML if present, falls back to directory listing JSON
- `start()` now calls `initRenderer()` before `fastify.listen()` — Shiki and Mermaid initialized before first request
- All 47 tests pass (13 new Phase 2 Plan 02 tests + 34 existing Phase 1/Phase 2 Plan 01 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Add failing tests for /render, /, /styles routes** - `ecfc677` (test)
2. **Task 1 (TDD GREEN): Add /render route, @fastify/static, root / route** - `7d90249` (feat)

_Task 2 is a checkpoint:human-verify — awaiting human visual confirmation._

## Files Created/Modified

- `src/server.js` - Added @fastify/static registration, /render route, / route, initRenderer() call in start()
- `test/server.test.js` - Added 13 new integration tests, initRenderer() in before() hook, README.md + test.md fixtures

## Decisions Made

- Register `@fastify/static` BEFORE route definitions in Fastify — avoids route prefix shadowing pitfall documented in RESEARCH.md
- `decorateReply: false` on @fastify/static — prevents reply decoration conflict with existing `reply.send()` usage in routes
- For 403 vs 404 distinction on `/render`: resolve path with `path.resolve(realBase, requestedPath)` (synchronous, no fs.realpath on target) — detects traversal even when file doesn't exist; then `readFileIfAllowed` returning null means 404 (file allowed but missing)
- Keep existing CSP (`script-src 'none'`) for now — Mermaid SVG inline styles may appear unstyled in browser; defer CSP adjustment to Phase 5 if needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect 403 for nonexistent-but-valid paths on /render**
- **Found during:** Task 1 (TDD GREEN — tests revealed bug)
- **Issue:** Plan's suggested logic used `isPathAllowed()` to distinguish 403 from 404, but `isPathAllowed` uses `fs.realpath` which requires the file to exist — so non-existent files within the root returned 403 instead of 404
- **Fix:** Changed to `path.resolve(realBase, requestedPath)` (sync, no realpath on target) for traversal detection; a path within root that reads as null from readFileIfAllowed is 404
- **Files modified:** src/server.js
- **Verification:** `GET /render?path=nonexistent.md` returns 404; `GET /render?path=../evil` returns 403
- **Committed in:** `7d90249` (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — logic bug in path security check)
**Impact on plan:** Essential correctness fix. The traversal protection goal is preserved; only the implementation of 403 vs 404 distinction changed.

## Issues Encountered

The `isPathAllowed()` function (from filesystem.js Phase 1) uses `fs.realpath` which requires the file to exist. The plan's suggested code relied on `isPathAllowed` to distinguish a disallowed path (403) from a missing file (404). This doesn't work for non-existent files. The fix uses `path.resolve` on the real base directory and the requested path — traversal results in a path outside the real base (detectable via `startsWith`), while a missing-but-valid file resolves within the base.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `/render` route is ready for visual verification (Task 2 checkpoint)
- Start server: `node bin/gsd-browser.cjs .` then open http://127.0.0.1:4242/
- Verify: `/render?path=<any-md-file>` — should show dark theme, GitHub-like formatting, breadcrumb, syntax highlighting
- Static CSS at `/styles/markdown.css` confirmed working (test passes)
- Phase 3 (tree navigation) can build on the / and /render routes

---
*Phase: 02-rendering*
*Completed: 2026-03-13*
