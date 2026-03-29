# Phase 5: Navigation Polish - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make markdown documents fully navigable within the SPA: relative .md links resolve correctly, headings get anchors, and long documents have an inline table of contents. Mermaid is already working (Phase 2, REND-01) and needs no changes here.

</domain>

<decisions>
## Implementation Decisions

### Table of contents
- Collapsible outline at the top of the rendered document in column 3 (the content pane)
- Style reference: GitHub's TOC dropdown — compact, expands on click, collapses out of the way
- Appears above the markdown body, not in the sidebar/navigator

### Claude's Discretion
- Relative link interception strategy (how .md links route through the SPA fetch pipeline)
- Heading anchor implementation (hover-reveal icon, hash in URL bar, scroll behavior)
- TOC depth (h2-only vs h2-h3 vs h2-h4)
- Non-.md link handling (open externally vs ignore)
- Cross-source link behavior
- markdown-it plugin choices (markdown-it-anchor, markdown-it-toc-done-right, or custom)

</decisions>

<specifics>
## Specific Ideas

- TOC should feel like GitHub's — a small toggle/dropdown at the top of the document, not a permanent sidebar element
- Column 3 is the content pane in the 3-column detail page layout (Phase 4.5.4)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `renderer.js`: markdown-it v14 instance with Shiki highlighting, footnotes, task lists — TOC and anchor plugins plug directly into this
- `markdown-it-anchor` was identified in STACK.md research but not yet installed
- Theme token system (Phase 4.5.2) provides CSS custom properties for consistent styling

### Established Patterns
- SPA content loading via `fetch('/render?source=...&path=...')` with fragment mode — link interception needs to hook into this
- markdown-it plugin pattern: `md.use(plugin, options)` in `initRenderer()`
- Server-side rendering — all HTML generated on server, client JS handles navigation

### Integration Points
- `renderer.js:initRenderer()` — where new markdown-it plugins get registered
- `server.js:/render` endpoint — where link rewriting or anchor generation happens
- Client-side click handlers in `index.html` — where relative link interception goes
- Detail page column 3 (`#phase-content`) — where TOC element gets injected

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-navigation-polish*
*Context gathered: 2026-03-28*
