---
phase: 05-navigation-polish
plan: 02
subsystem: ui
tags: [spa, navigation, anchor-scroll, relative-links, markdown-it-anchor]

# Dependency graph
requires:
  - phase: 05-01
    provides: heading ID attributes and TOC anchor links from markdown-it-anchor
provides:
  - resolvePath() utility for relative path resolution in SPA
  - interceptMdLinks() delegated click handler for both browse and detail views
  - Fragment-only link interception with in-container scrollIntoView
  - Relative .md link navigation in both browse and detail SPA views
affects: [future content views that inject markdown HTML into scrollable divs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delegated click handler on scrollable container intercepts both .md links and #fragment links"
    - "CSS.escape() for safe ID lookup on heading anchors"
    - "scrollIntoView on container's child element scrolls within the overflow:auto div"
    - "dataset.currentFile on #phase-content tracks active file for relative link resolution"

key-files:
  created: []
  modified:
    - public/index.html

key-decisions:
  - "Intercept #fragment links in the SPA — native browser scroll targets window.scrollY but content divs use overflow:auto; scrollIntoView on the element scrolls the nearest scrollable ancestor correctly"
  - "resolvePath() handles ../ segments for correct cross-directory link resolution"
  - "contextFn() pattern passed to interceptMdLinks provides current file and view type without tight coupling"

patterns-established:
  - "Pattern: Any scrollable content container receiving injected markdown HTML needs its own fragment-link interceptor"

requirements-completed: [NAV-04, NAV-05]

# Metrics
duration: 15min
completed: 2026-03-29
---

# Phase 5 Plan 02: Navigation Polish — Link Interception and Hash Scroll Summary

**Client-side relative .md link interception and fragment-anchor scroll for browse and detail views, fixing native browser scroll limitation in overflow:auto containers**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T07:10:00Z
- **Completed:** 2026-03-29T07:25:00Z
- **Tasks:** 2 (Task 1 implementation + Task 2 human-verify + bug fix)
- **Files modified:** 1

## Accomplishments
- Added `resolvePath()` for `../` and `./` relative path normalization
- Added `interceptMdLinks()` delegated handler wired to `#browse-content` and `#phase-content`
- Fixed critical bug: fragment-only `#heading` links now scroll within the content container instead of attempting native page scroll (which fails because `body` has `overflow:hidden`)
- Relative `.md` links navigate within the SPA without full page reload in both views
- External `http://`/`https://` links pass through unmodified

## Task Commits

Each task was committed atomically:

1. **Task 1: Add relative link interception and hash scroll to index.html** - `cfa9d92` (feat)
2. **Bug fix: Intercept fragment-only links for in-container scroll** - `9e2623a` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `public/index.html` - Added `resolvePath()`, `interceptMdLinks()`, fragment-link interception, wired both content containers

## Decisions Made
- Intercept `#fragment` links rather than letting browser handle natively — the SPA body has `overflow:hidden` so native anchor scroll targets the wrong scroll context. The content lives in `overflow:auto` divs; `scrollIntoView()` on a child element scrolls the nearest scrollable ancestor, which is the correct div.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fragment-only anchor links (#heading) did not scroll to target**
- **Found during:** Task 2 (visual verification checkpoint — user reported heading anchors and TOC links not scrolling)
- **Issue:** The original plan specified "skip fragment-only links — let the browser scroll natively." This fails because `body` has `overflow:hidden` in the SPA. The browser's native anchor navigation scrolls `window.scrollY`, not the `overflow:auto` content divs where headings actually live.
- **Fix:** Replaced the early-return for `#` links with an explicit `containerEl.querySelector('#' + CSS.escape(fragment))` lookup and `scrollIntoView({ behavior: 'smooth', block: 'start' })` call.
- **Files modified:** public/index.html
- **Verification:** All 121 tests pass. Dev server restarted for re-verification.
- **Committed in:** `9e2623a`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in original plan assumption)
**Impact on plan:** The fix is essential for NAV-05 correctness. No scope creep.

## Issues Encountered
- Plan's assumption that native browser anchor scroll would work was incorrect for this SPA architecture. The overflow:hidden body means the browser has no scrollable viewport to target. Diagnosed from the user's checkpoint report and fixed immediately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NAV-04 (relative .md link navigation) complete
- NAV-05 (heading anchor scroll) complete
- NAV-06 (inline TOC) was completed in Plan 01 (server side); Plan 02 completes the client-side scroll behavior
- Navigation polish phase is complete

---
*Phase: 05-navigation-polish*
*Completed: 2026-03-29*
