# Phase 2: Rendering - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Markdown files render as readable, syntax-highlighted HTML in the browser. Covers GFM rendering, Shiki code highlighting, Mermaid diagram rendering (server-side SVG), and readable dark-themed typography. Browser UI shell (Phase 4), navigation features (Phase 5), and source management (Phase 3) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### HTML delivery model
- Server returns a full HTML page (complete `<html>` document with `<head>` and `<body>`) for rendered markdown
- Separate `/render` route for rendered HTML — existing `/file` route stays for raw file access
- Minimal breadcrumb header at top of each rendered page showing the file path
- Root URL (`/`) renders `README.md` from the registered root if present; falls back to directory listing
- Phase 4 replaces this standalone HTML wrapper with its 3-panel UI shell

### Visual styling
- GitHub-like markdown aesthetic — familiar headings, subtle rules, proper table borders, clean list indentation
- Dark default background with light text (consistent with Phase 4's DSGN-02 dark theme)
- Separate stylesheet served from the server (e.g., `/styles/markdown.css`) — not inline in each page
- Phase 4 extends or replaces this stylesheet when adding theming

### Mermaid rendering
- Server-side SVG rendering — Mermaid diagrams rendered to static SVG on the server
- Strict CSP (`script-src 'none'`) stays intact — no client-side JavaScript needed
- Dark-compatible Mermaid theme so SVGs look native on the dark background
- Failure fallback: show raw Mermaid source in a syntax-highlighted code block, plus error message
- Graceful degradation — page renders even if Mermaid rendering fails

### Code block presentation
- Shiki v4 for server-side syntax highlighting (no client JS, works with strict CSP)
- No line numbers on code blocks — clean look
- Long lines scroll horizontally (no wrapping)
- Copy-to-clipboard is deferred to v2 (POLSH-01)

### Claude's Discretion
- Max-width for the prose container (somewhere in the 720-900px range)
- Language label style on code blocks (corner badge vs header bar)
- Shiki color theme selection (must complement dark background)
- Mermaid dependency management (bundled vs lazy-load on first use)
- Exact spacing, font choices, and typography details within the GitHub-like direction

</decisions>

<specifics>
## Specific Ideas

- GitHub-like rendering is the baseline expectation — familiar to any developer reading README files
- Root URL should feel like landing on a GitHub repo page (README.md auto-rendered)
- The standalone rendered page (before Phase 4) should be immediately useful for browsing docs
- Vite-clean aesthetic carries forward from Phase 1 context — minimal chrome, no clutter

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server.js`: Fastify server with `createServer()` and `start()` — new `/render` route adds alongside existing `/file` route
- `src/filesystem.js`: `isPathAllowed()` and `readFileIfAllowed()` — reuse for path safety on the render route
- `CSP_HEADER` constant in `server.js` — stays as-is (`script-src 'none'`) since rendering is all server-side

### Established Patterns
- CJS modules (`require`/`module.exports`) throughout
- Fastify route pattern: `fastify.get('/path', async (request, reply) => {...})`
- MIME type handling already exists for non-markdown files
- node:test for testing

### Integration Points
- New `src/renderer.js` module: markdown-it + Shiki + Mermaid pipeline, called from the `/render` route
- `/render?path=<file>` route in `server.js` — reads file via `readFileIfAllowed()`, pipes through renderer
- `public/styles/markdown.css` — new static asset directory for the stylesheet
- Phase 4 will call `/render` to get HTML fragments for its content pane (may need a `?fragment=true` param later)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-rendering*
*Context gathered: 2026-03-13*
