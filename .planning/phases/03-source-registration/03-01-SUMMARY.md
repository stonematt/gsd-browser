---
phase: 03-source-registration
plan: 01
subsystem: api
tags: [node, cjs, config, xdg, sources, registry, conventions]

# Dependency graph
requires:
  - phase: 02-rendering
    provides: existing CJS module and node:test patterns used throughout

provides:
  - src/sources.js: source registry module with full CRUD API and config persistence
  - test/sources.test.js: 23 unit tests covering all source registry behaviors

affects:
  - 03-02 (CLI integration will import addSource, removeSource, listSources)
  - 03-03 (REST API endpoints will delegate to sources.js functions)
  - 04-ui-shell (multi-source navigation reads from sources registry)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "XDG config path: process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')"
    - "Atomic write: writeFileSync to .tmp in same dir, then renameSync — avoids cross-device errors"
    - "statSync for existence checks: distinguishes ENOENT from EACCES vs existsSync"
    - "Optional configPath parameter pattern for test isolation without mocking"
    - "Return shape: { ok: boolean, reason?, ... } for operation results"

key-files:
  created:
    - src/sources.js
    - test/sources.test.js
  modified: []

key-decisions:
  - "Pure Node.js built-ins only: conf and env-paths are ESM-only — incompatible with CJS codebase"
  - "Atomic write uses .tmp in same directory as config, not os.tmpdir(), to avoid cross-device rename"
  - "Optional configPath parameter on all functions enables test isolation without env var pollution"
  - "removeSource matches by resolved path first, then by name — path match is unambiguous"
  - "Auto-suffix duplicate names (-2, -3) chosen over prompt — pipe-safe, no interactive dependency"

patterns-established:
  - "Result shape: { ok: true, <payload> } or { ok: false, reason: string, <context?> }"
  - "Optional configPath last-argument pattern for function-level test isolation"
  - "discoverConventions uses statSync in try/catch — any error = convention absent"

requirements-completed: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 3 Plan 01: Source Registration Module Summary

**XDG-compliant source registry with atomic config persistence, auto-name deduplication, and convention discovery for .planning/, docs/, and README.md**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-14T03:09:13Z
- **Completed:** 2026-03-14T03:11:12Z
- **Tasks:** 1 (TDD: RED + GREEN commits)
- **Files modified:** 2

## Accomplishments

- Source registry module (`src/sources.js`) with 8 exported functions covering full CRUD lifecycle
- XDG-compliant config path (`~/.config/gsd-browser/sources.json` or `$XDG_CONFIG_HOME/...`)
- Atomic writes via `.tmp` + `renameSync` to prevent config corruption
- Auto-suffix for duplicate names (`myproject`, `myproject-2`, `myproject-3`)
- Convention discovery using `statSync` for `.planning/`, `docs/`, `README.md`
- 23 unit tests pass; full suite 70/70 with zero regressions
- Zero new dependencies added to `package.json`

## Task Commits

Each TDD phase committed atomically:

1. **RED — Failing tests** - `ec3b2b0` (test)
2. **GREEN — Implementation** - `e98cab6` (feat)

## Files Created/Modified

- `src/sources.js` — Source registry module: getConfigPath, loadConfig, saveConfig, addSource, removeSource, listSources, discoverConventions, enrichSourcesWithConventions
- `test/sources.test.js` — 23 unit tests covering all source registry behaviors with temp-dir isolation

## Decisions Made

- **No external packages:** `conf` and `env-paths` are ESM-only; incompatible with this CJS codebase. Implemented XDG path logic directly (single line).
- **Same-dir .tmp for atomic writes:** Writing `.tmp` to `os.tmpdir()` would cause `EXDEV` cross-device rename errors on some systems. Tmp file goes in same dir as config.
- **Optional `configPath` parameter:** All functions accept an optional last-argument `configPath`. Tests pass temp paths directly rather than overriding `XDG_CONFIG_HOME`, avoiding env pollution between test cases.
- **Path-first removeSource matching:** When removing, resolved path match is tried before name match — paths are always unambiguous, names can collide.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `node --test test/` (directory form) failed with MODULE_NOT_FOUND on Node 25 — used explicit file list `node --test test/filesystem.test.js test/renderer.test.js test/server.test.js test/sources.test.js` for regression check. This is a pre-existing limitation, not introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/sources.js` is fully functional and tested in isolation
- Ready for Phase 3 Plan 02: CLI integration (`add`, `remove`, `list` subcommands in `bin/gsd-browser.cjs`)
- Ready for Phase 3 Plan 03: REST API endpoints (`GET/POST/DELETE /api/sources`) and web UI management page

---
*Phase: 03-source-registration*
*Completed: 2026-03-14*
