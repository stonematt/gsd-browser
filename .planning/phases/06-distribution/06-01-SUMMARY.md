---
phase: 06-distribution
plan: "01"
subsystem: distribution
tags: [first-run, auto-open, startup-banner, npm-publish, cli]
dependency_graph:
  requires: []
  provides: [first-run-UX, resolveShouldOpen, formatBanner, npm-package-metadata]
  affects: [bin/gsd-browser.cjs, src/sources.js, src/server.js, package.json]
tech_stack:
  added: [open@11]
  patterns: [TDD-RED-GREEN, resolveShouldOpen-precedence, formatBanner-unit-testable]
key_files:
  created: []
  modified:
    - package.json
    - bin/gsd-browser.cjs
    - src/server.js
    - src/sources.js
    - test/sources.test.js
    - test/server.test.js
decisions:
  - "resolveShouldOpen exported from sources.js as pure function for testability — keeps bin thin"
  - "formatBanner exported from server.js for unit testing without starting server"
  - "loadConfig normalizes missing sources key to empty array — prevents crashes from config files with only open:false"
  - "First-run auto-registers CWD when discoverConventions finds .planning/docs/README.md"
  - "First-run with no conventions starts server and opens /sources management page rather than exiting"
  - "Auto-open default is true (open behavior) — --no-open suppresses, config.open persists preference"
metrics:
  duration: "6 min"
  completed_date: "2026-03-29"
  tasks_completed: 3
  files_changed: 6
---

# Phase 6 Plan 01: First-Run UX, Auto-Open Config, Startup Banner Summary

**One-liner:** npm-ready package.json with first-run CWD auto-registration, resolveShouldOpen precedence logic, and formatBanner producing version + per-source convention listing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — Add test cases for new behaviors | b0a7908 | test/sources.test.js, test/server.test.js |
| 2 | Package metadata and open dependency | a7b1f1f | package.json, package-lock.json |
| 3 | First-run detection, auto-open config, and startup banner | 23a027a | src/sources.js, src/server.js, bin/gsd-browser.cjs |

## What Was Built

### package.json
- Version bumped to 0.9.0
- `files` whitelist: `src/`, `bin/gsd-browser.cjs`, `public/`, `README.md`, `LICENSE`
- Full npm metadata: author, repository, homepage, keywords
- `open` package added to `dependencies` (was previously a try/catch optional import)
- `npm pack --dry-run` confirms no `.planning/`, `test/`, or `bin/dev*` files included

### src/sources.js
- `loadConfig()` normalizes any config missing `sources` key — prevents crashes when config contains only `open: false`
- New `resolveShouldOpen(argv, configOpen)`: pure function implementing `--no-open > --open > config.open > true` precedence; exported for unit testing

### src/server.js
- New `formatBanner(version, port, sources)`: returns formatted startup string with version URL and per-source convention listing (`.planning/`, `docs/`, `README.md`, "no conventions"); appends `(auto-registered)` tag when `_autoRegistered: true`
- `start()` uses `formatBanner()` for startup output; accepts `options.openUrl` for redirecting to `/sources` on first run
- `formatBanner` exported for unit testing

### bin/gsd-browser.cjs
- Imports `resolveShouldOpen`, `discoverConventions`, `saveConfig` from sources.js
- First-run path: when `config.sources.length === 0`, calls `discoverConventions(process.cwd())`
  - Conventions found: auto-registers CWD via `addSource('.')`, sets `_autoRegistered: true`, starts server
  - No conventions found: prints guided help message, starts server with `openUrl: /sources`
- `resolveShouldOpen(process.argv, config.open)` replaces previous `args.open` literal
- USAGE updated: `--open` replaced with `--no-open` with config persistence note

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `node --test test/sources.test.js` — 28/28 pass (includes 5 new Wave 0 tests)
- `node --test test/server.test.js` — 124/124 pass (includes 3 new banner tests)
- `npm pack --dry-run` — only src/, bin/gsd-browser.cjs, public/, README.md, LICENSE, package.json included

## Self-Check: PASSED

- SUMMARY.md exists at .planning/phases/06-distribution/06-01-SUMMARY.md
- b0a7908 (Task 1 — Wave 0 tests) confirmed in git log
- a7b1f1f (Task 2 — package metadata) confirmed in git log
- 23a027a (Task 3 — first-run UX) confirmed in git log
