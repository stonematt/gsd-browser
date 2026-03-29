---
phase: 05-navigation-polish
plan: 01
subsystem: ui
tags: [markdown-it-anchor, markdown-it, toc, heading-anchors, renderer, css]

requires:
  - phase: 04.5.4-detail-page-layout
    provides: renderMarkdown() pipeline with frontmatter stripping and fragment support

provides:
  - heading anchors (id attributes) on h2/h3/h4 via markdown-it-anchor
  - permalink anchor elements with class header-anchor
  - buildTocHtml() function generating collapsible details.doc-toc
  - renderMarkdown() returns tocHtml + markdown-body HTML for 2+ heading docs
  - CSS styles for .doc-toc and .header-anchor using theme tokens

affects: [05-navigation-polish, renderer-consumers]

tech-stack:
  added: [markdown-it-anchor@9.2.0]
  patterns:
    - headingsBuffer module var cleared before md.render(), populated via anchor plugin callback
    - TOC prepended outside markdown-body div so it sits above content
    - Buffer cleared after all awaits to prevent concurrency interleave

key-files:
  created: []
  modified:
    - src/renderer.js
    - public/styles/markdown.css
    - test/renderer.test.js
    - package.json

key-decisions:
  - "headingsBuffer cleared with .length=0 after Mermaid awaits, before md.render() — prevents heading bleed between concurrent calls"
  - "TOC rendered outside markdown-body div so layout treats it as a sibling, not content"
  - "buildTocHtml returns empty string for <2 headings — no element injected at all"
  - "Indentation uses (h.level - minLevel) * 16px for relative indent, not absolute levels"
  - ".header-anchor opacity:0 by default, reveal on heading hover via CSS only — no JS needed"

patterns-established:
  - "TDD pattern: failing tests first (RED), then implementation (GREEN)"
  - "anchor plugin callback populates module-level headingsBuffer — reading after md.render() captures all headings synchronously"

requirements-completed: [NAV-05, NAV-06]

duration: 2min
completed: 2026-03-29
---

# Phase 5 Plan 01: Navigation Polish — Heading Anchors and TOC Summary

**markdown-it-anchor integration with collapsible TOC and hover-reveal permalink anchors via server-side renderer.js**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T06:59:48Z
- **Completed:** 2026-03-29T07:02:00Z
- **Tasks:** 2 (Task 1 TDD, Task 2 CSS)
- **Files modified:** 4

## Accomplishments

- h2/h3/h4 headings now render with stable `id` attributes (slugified, deduplicated with numeric suffix)
- Permalink anchor elements (`class="header-anchor"`) appear before each heading, revealed on hover via CSS
- Documents with 2+ headings get a collapsible `<details class="doc-toc">` prepended above the markdown-body
- Documents with 0-1 headings get no TOC — no element injected
- 9 new tests covering NAV-05 and NAV-06 behaviors, all passing alongside 183 total suite tests

## Task Commits

1. **Task 1: Install markdown-it-anchor and add heading anchors + TOC to renderer.js** - `cfe1676` (feat)
2. **Task 2: Add TOC and heading anchor CSS styles** - `36f9286` (feat)

## Files Created/Modified

- `src/renderer.js` — headingsBuffer, anchor plugin setup, buildTocHtml(), updated renderMarkdown()
- `test/renderer.test.js` — NAV-05 (4 tests) and NAV-06 (5 tests) describe blocks added
- `public/styles/markdown.css` — .doc-toc, .doc-toc summary, .doc-toc ul/li/a, .header-anchor rules
- `package.json` — markdown-it-anchor@^9.2.0 added to dependencies

## Decisions Made

- Buffer cleared with `headingsBuffer.length = 0` after all Mermaid awaits and before `md.render()` — this is the only synchronous window between awaits, making it safe from concurrency interleave
- TOC element sits outside the `.markdown-body` div so page layout doesn't inherit max-width constraints twice
- `buildTocHtml` threshold is `< 2` headings → no TOC, ensuring single-heading docs stay uncluttered
- Used `(h.level - minLevel) * 16px` indent calculation so mixed h2/h3 docs still look right even if no h2 is present

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- NAV-05 and NAV-06 requirements fully satisfied
- Renderer output contract unchanged (still returns string from renderMarkdown)
- CSS variables used throughout — theme switching works automatically

---
*Phase: 05-navigation-polish*
*Completed: 2026-03-29*
