---
phase: 03-source-registration
plan: 02
subsystem: cli+server
tags: [node, cjs, cli, multi-source, fastify, subcommands]

# Dependency graph
requires:
  - phase: 03-source-registration
    plan: 01
    provides: src/sources.js with addSource, removeSource, listSources, loadConfig, enrichSourcesWithConventions

provides:
  - bin/gsd-browser.cjs: CLI with add/remove/list subcommand dispatch and multi-source server start
  - src/server.js: Fastify server accepting sources[] array for all routes with path traversal across all roots
  - test/server.test.js: Updated integration tests using sources[] array format plus 5 new multi-source tests

affects:
  - 03-03 (REST API endpoints for source management will call same sources.js functions)
  - 04-ui-shell (multi-source navigation reads from enriched sources array)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findSourceForPath(): iterate sources array, return first match via isPathAllowed"
    - "/render two-step: check geometric containment across all roots (403), then try read from each (404)"
    - "makeSources() test helper wraps single dir in sources array format for DRY test migration"
    - "CLI subcommand dispatch on args._[0] before minimist boolean/string parsing"
    - "XDG_CONFIG_HOME override in CLI tests for hermetic no-config-loaded behavior"

key-files:
  created: []
  modified:
    - bin/gsd-browser.cjs
    - src/server.js
    - test/server.test.js

key-decisions:
  - "/render path check is two-pass: geometric containment check across all roots for 403, then read-attempt loop for 404 — prevents relative paths from always matching first source"
  - "makeSources() test helper added to DRY-ify migration of 20+ createServer() calls"
  - "CLI no-subcommand path reads config via loadConfig + enrichSourcesWithConventions directly (not via listSources) to avoid double enrichment"

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 3 Plan 02: CLI Integration and Multi-Source Server Summary

**CLI subcommands (add/remove/list) wired to sources.js registry; Fastify server migrated from single registeredRoot string to sources[] array with traversal protection across all registered roots**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-14T03:13:49Z
- **Completed:** 2026-03-14T03:17:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `gsd-browser add [path]` registers source directory, prints path + discovered conventions
- `gsd-browser remove <name|path>` removes source with ambiguity handling
- `gsd-browser list` prints aligned table (NAME, PATH, STATUS, CONVENTIONS) docker-ps style
- `gsd-browser` (no subcommand) loads config, warns about missing sources, starts multi-source server
- `createServer(sources[])` replaces `createServer(registeredRoot)` — all routes loop sources
- `findSourceForPath()` helper iterates sources array for `/file` route matching
- `/render` route uses two-pass check: geometric containment for 403, file read loop for 404
- `start()` re-enriches conventions at startup before forwarding to `createServer()`
- All 75 tests pass (70 existing + 5 new multi-source integration tests)

## Task Commits

1. **Task 1 — CLI subcommand dispatch** - `0b6feb6` (feat)
2. **Task 2 — Multi-source server migration + tests** - `eb6b765` (feat)

## Files Created/Modified

- `bin/gsd-browser.cjs` — CLI rewritten: add/remove/list subcommand dispatch, server start reads from persistent config
- `src/server.js` — createServer() and start() migrated to sources[] array; findSourceForPath() helper added; all three routes (/, /file, /render) updated
- `test/server.test.js` — All createServer(testDir)/start(0, testDir) calls migrated to makeSources() helper; 5 new multi-source tests added

## Decisions Made

- **Two-pass /render logic:** A simple "first source whose root contains the path" approach fails for relative paths because any relative path is geometrically inside all source roots. Fix: check geometric containment across all roots first (→ 403 if outside all), then attempt file read from each allowed source (→ 404 if not found anywhere). This correctly routes `doc.md` to whichever source actually has it.
- **makeSources() test helper:** Rather than repeating `[{ name: 'test', path: dir, available: true, conventions: [] }]` across 20+ test calls, extracted a helper. This keeps existing tests readable without changing their semantics.
- **CLI reads config directly for server start:** Uses `loadConfig() + enrichSourcesWithConventions()` rather than `listSources()` to stay consistent with the server's own startup enrichment and avoid calling enrich twice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed /render multi-source routing for relative paths**

- **Found during:** Task 2 — new multi-source /render test failed (404 instead of 200)
- **Issue:** Original implementation checked geometric containment against sources and returned the first match. All relative paths (e.g. `doc.md`) are geometrically within every source root, so the first source was always selected regardless of where the file actually lives.
- **Fix:** Changed to two-pass approach: (1) collect all sources the path is within (for 403 detection), (2) try reading the file from each allowed source — first success wins.
- **Files modified:** `src/server.js`
- **Commit:** eb6b765 (included in Task 2 commit)

## Self-Check: PASSED

- bin/gsd-browser.cjs: FOUND
- src/server.js: FOUND
- test/server.test.js: FOUND
- 03-02-SUMMARY.md: FOUND
- Task 1 commit 0b6feb6: FOUND
- Task 2 commit eb6b765: FOUND
