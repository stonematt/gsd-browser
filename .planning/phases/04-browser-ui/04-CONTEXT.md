# Phase 4: Browser UI - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A working three-panel browser UI (header + sidebar + content pane) where users can navigate between registered repos and browse their file trees. The sidebar shows a collapsible/expandable file tree for the active source, a source switcher lets users jump between registered repos, and clicking a file renders it in the content pane without a full page reload. Dark default theme. Source management (Phase 3), navigation polish like relative links and TOC (Phase 5), and GSD dashboard (Phase 4.5) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### File tree scope
- Show markdown files only (.md) — this is a markdown browser, other file types are noise
- Convention directories (.planning, docs) elevated at the top of the tree with distinct visual treatment (icon, badge, or color differentiation)
- Convention dirs expanded by default; other directories collapsed
- Directories that contain no .md files (at any depth) should be omitted from the tree

### Content pane behavior
- Deep-linkable URLs via pushState — URL reflects current source and file path (e.g., `/#/source-name/path/to/file.md`), enabling bookmarks, sharing, and refresh-to-same-file
- Back/forward browser navigation works naturally via popstate
- Smooth content swap — fetch rendered HTML fragment, replace content pane innerHTML; no loading spinner unless response takes >200ms
- Auto-render README.md when first opening the app or switching to a source (consistent with Phase 2's root behavior)
- Active file highlighted in the sidebar tree with auto-expand of parent directories to show the active file (VS Code explorer pattern)

### Source switcher
- Source selector lives at the top of the sidebar, above the file tree
- Dropdown shows source name + smaller path hint underneath for disambiguation
- Remember last-viewed file per source in session memory (not persisted across restarts) — switching back to a source returns to the file you were reading
- Source management stays at `/sources` as a separate page; main UI has a "Manage Sources" link in the header

### Visual design
- GitHub-style app shell: dark sidebar (#161b22), subtle borders (#21262d), muted secondary text (#8b949e) — carries forward existing `index.html` and `sources.html` palette
- Fixed sidebar width (no drag-to-resize)
- Header bar shows breadcrumb path for the current file (e.g., `source-name / .planning / ROADMAP.md`)
- Sidebar collapsible via toggle button — content pane expands to full width for reading long docs
- Vite-clean minimal chrome — no unnecessary decoration or heavy borders

### Claude's Discretion
- File tree loading strategy (full upfront vs lazy-load on expand — pick based on typical repo sizes)
- Exact sidebar width (likely 240-280px range)
- Toggle button style and position (hamburger icon, chevron, etc.)
- Content pane max-width behavior (full-width vs max-width prose container — may reuse existing markdown.css max-width)
- Loading indicator threshold and style if >200ms
- Hash-based vs path-based URL routing (hash is simpler with no server changes)
- Fragment mode implementation for `/render` route (query param like `?fragment=true` or separate endpoint)
- File tree indentation and expand/collapse icons
- How to handle sources with no README.md on initial load (empty pane with hint vs first .md file)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/index.html`: Current homepage with dark theme, GitHub-inspired styling, source listing with collapsible file groups. Will be replaced by the Phase 4 UI shell but its color palette and CSS patterns carry forward.
- `public/sources.html`: Source management page with dark theme, table layout, modals. Stays as-is; linked from main UI.
- `public/styles/markdown.css`: Existing stylesheet for rendered markdown content. Reuse in the content pane.
- `/api/sources` and `/api/sources/:name/files` endpoints: Already return source lists and grouped file data. File tree can build on these or need a new recursive tree endpoint.
- `src/renderer.js` `buildPage()`: Returns full HTML pages. Needs a fragment mode (skip `<html>/<head>` wrapper) so content pane can fetch and inject rendered HTML.

### Established Patterns
- CJS modules throughout (`require`/`module.exports`)
- Fastify route pattern with per-route CSP via `onSend` hook
- `MANAGEMENT_CSP` allows `script-src 'self' 'unsafe-inline'` — Phase 4 UI pages need this
- `CSP_HEADER` is strict (`script-src 'none'`) — rendered markdown content stays strict
- `@fastify/static` serves `public/` directory
- Dark theme colors: `#0d1117` (bg), `#161b22` (surface), `#21262d` (border), `#c9d1d9` (text), `#f0f6fc` (bright text), `#58a6ff` (link), `#8b949e` (muted)

### Integration Points
- `public/index.html` — Replace with three-panel UI shell (same file path, new content)
- `src/server.js` `/` route — Already serves `index.html` with MANAGEMENT_CSP
- `src/server.js` `/render` route — Add fragment mode support (return just the `<div class="markdown-body">` without full page wrapper)
- `src/server.js` — May need a new `/api/sources/:name/tree` endpoint for recursive directory tree (currently `/api/sources/:name/files` only returns top-level convention groups)
- `CSP_HEADER` comment already says "Phase 4: change script-src 'none' to script-src 'self' when adding frontend JS" — but this only needs to change for the app shell pages, not rendered content

</code_context>

<specifics>
## Specific Ideas

- GitHub repo browser in dark mode is the visual reference — familiar to developers
- VS Code's file explorer behavior for tree-content sync (highlight active file, auto-expand parents)
- Vite-clean chrome carries forward — minimal header, no heavy borders or excessive decoration
- Breadcrumb in header provides orientation without cluttering the content area
- Collapsible sidebar enables focused reading mode for long documents

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-browser-ui*
*Context gathered: 2026-03-21*
