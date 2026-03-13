---
phase: 02-rendering
plan: 01
subsystem: rendering
tags: [markdown-it, shiki, mermaid, svgdom, github-markdown-css, fastify-static, syntax-highlighting, svg-rendering]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: filesystem.js readFileIfAllowed, server.js Fastify server with CSP header

provides:
  - src/renderer.js: initRenderer(), renderMarkdown(), buildPage() markdown-to-HTML pipeline
  - public/styles/markdown.css: GitHub dark stylesheet with prose container
  - Shiki github-dark syntax highlighting for 24+ languages
  - Mermaid server-side SVG rendering via svgdom (or graceful fallback)
  - Full HTML page template with breadcrumb header and stylesheet link

affects:
  - 02-02 (server route integration will call renderMarkdown/buildPage)
  - 04-ui-shell (will extend/replace markdown.css)
  - 05-navigation (will use renderer for rendered output)

# Tech tracking
tech-stack:
  added:
    - markdown-it ^14 (GFM parser with tables, strikethrough built-in)
    - markdown-it-task-lists ^2.1 (- [x] checkbox syntax)
    - markdown-it-footnote ^4 ([^1] footnote support)
    - shiki ^4 (ESM-only syntax highlighter, github-dark theme)
    - mermaid ^11 (diagram rendering)
    - svgdom ^0.1 (DOM polyfill for server-side Mermaid)
    - github-markdown-css ^5.9 (GitHub dark variant stylesheet)
    - "@fastify/static" ^8 (static file serving for public/ directory)
  patterns:
    - CJS dynamic import for ESM-only libraries (await import('shiki'))
    - Singleton highlighter pattern (init once at startup, reuse per request)
    - Two-pass async render (pre-process mermaid blocks async, then sync md.render())
    - Graceful degradation (Shiki/Mermaid failures logged but don't crash)

key-files:
  created:
    - src/renderer.js
    - public/styles/markdown.css
    - test/renderer.test.js
  modified:
    - package.json (8 new dependencies added)

key-decisions:
  - "Two-pass Mermaid rendering: async pre-pass extracts and renders diagrams, then synchronous md.render() injects via fence override"
  - "CJS dynamic import pattern for ESM-only Shiki: await import('shiki') inside initRenderer()"
  - "html: false in markdown-it for security — no raw HTML passthrough, maintains strict CSP"
  - "Graceful degradation per subsystem: Shiki/Mermaid failures log warnings but rendering continues"
  - "github-markdown-dark.css copied literally (not @imported) — avoids serving from node_modules"
  - "unlabeled fenced code blocks use lang 'text' in Shiki — clean, never wrong"
  - "Mermaid svgdom approach over mermaid-isomorphic (Playwright-free, zero-install compatible)"

patterns-established:
  - "Pattern: CJS + ESM interop — use await import() inside async functions for ESM-only packages"
  - "Pattern: Singleton init — expensive async init once at startup, lightweight per-request use"
  - "Pattern: Two-pass async/sync — pre-compute async side effects, then pass results into sync renderer"
  - "Pattern: Graceful degradation — per-subsystem try/catch, warn on failure, degrade cleanly"

requirements-completed: [SERV-02, SERV-03, REND-01, REND-02]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 2 Plan 01: Markdown Rendering Pipeline Summary

**GFM-to-HTML pipeline with Shiki github-dark syntax highlighting, server-side Mermaid SVG via svgdom, and GitHub dark CSS — all server-side with strict CSP preserved**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T20:28:26Z
- **Completed:** 2026-03-13T20:30:43Z
- **Tasks:** 2 (TDD)
- **Files modified:** 4 created, 1 modified

## Accomplishments

- `src/renderer.js` implements full markdown-to-HTML pipeline: initRenderer(), renderMarkdown(), buildPage()
- Shiki v4 github-dark syntax highlighting for 24+ languages via CJS dynamic import pattern
- Mermaid server-side SVG via svgdom polyfill with graceful fallback on failure
- All GFM features working: tables, task lists, strikethrough, footnotes
- `public/styles/markdown.css` with full github-markdown-dark.css + project overrides (860px, breadcrumb, Mermaid containers)
- 11 new unit tests, all 34 tests (Phase 1 + Phase 2) pass green

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create renderer module with full pipeline** - `cc979c0` (feat)
2. **Task 2: Create GitHub dark stylesheet with prose container overrides** - `b000678` (feat)

_Note: Task 1 used TDD pattern (RED → GREEN). Tests written first, then implementation._

## Files Created/Modified

- `src/renderer.js` - Markdown rendering pipeline: initRenderer, renderMarkdown, buildPage
- `test/renderer.test.js` - 11 unit tests covering GFM, Shiki, Mermaid, page structure
- `public/styles/markdown.css` - GitHub dark CSS (988 lines) + project overrides (60 lines)
- `package.json` - 8 rendering dependencies added
- `package-lock.json` - lockfile updated (219 packages added)

## Decisions Made

- Used `await import('shiki')` inside `initRenderer()` to handle ESM-only package in CJS project
- Two-pass strategy for Mermaid: async pre-pass to render all diagrams, then inject via synchronous fence override. This avoids the `[object Promise]` pitfall from Pitfall 2 in RESEARCH.md.
- `html: false` in markdown-it config preserves security posture (`script-src 'none'` CSP intact)
- Mermaid init sets `htmlLabels: false` and `flowchart: { htmlLabels: false }` to avoid svgdom getBoundingClientRect failures (Pitfall 3 from RESEARCH.md)
- Copied github-markdown-dark.css literally into markdown.css (no @import) so it's served directly without requiring node_modules to be in the static file path

## Deviations from Plan

None - plan executed exactly as written. The open question about mermaid v11 + svgdom compatibility (from RESEARCH.md) was resolved during implementation: it works correctly with `htmlLabels: false`.

## Issues Encountered

None. All patterns from RESEARCH.md worked as documented. Mermaid v11 + svgdom compatibility confirmed functional with `htmlLabels: false` configuration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/renderer.js` is ready for Plan 02-02 which will add the `/render` route to `server.js`
- `public/styles/markdown.css` is ready for `@fastify/static` registration in server.js
- All test infrastructure in place; Phase 1 tests unaffected

---
*Phase: 02-rendering*
*Completed: 2026-03-13*
