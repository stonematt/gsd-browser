# Phase 1: Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

A secure, localhost-only HTTP server that safely serves files from a user-specified directory. Accepts a path argument, enforces path traversal protection, adds CSP headers, and serves fresh-from-disk content on every request. Source registration (Phase 3), markdown rendering (Phase 2), and browser UI (Phase 4) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Initial serving behavior
- Server accepts a positional directory argument: `gsd-browser ./my-repo`
- Serves any file type within the allowed directory (not just .md) with appropriate MIME types
- Path argument is required; running with no args prints help/usage

### Error response format
- All errors return JSON: `{ error: "message", status: 403, requested: "/path", allowed: ["/sources"] }`
- Developer-verbose — include the requested path, allowed source roots, and reason for rejection
- This is a localhost-only dev tool; verbose errors aid debugging without security risk

### Port conflict handling
- Fail-fast with clear stderr message: `Port 3000 in use. Try --port 3001`
- Exit with non-zero code
- No auto-retry or port scanning

### CLI startup message
- Minimal one-liner on stdout: `gsd-browser serving ./my-repo at http://127.0.0.1:XXXX`
- No ASCII box or banner — clean like Vite's startup

### Browser auto-open
- No auto-open by default
- `--open` flag to opt in to opening the browser on start

### CLI flags in Phase 1
- `--port` to set custom port
- `--open` to auto-open browser
- `--help` with usage info
- `--version` with package version

### Claude's Discretion
- Default port number (something that avoids common 3000-range dev server collisions)
- Response format for markdown files in Phase 1 (raw text vs minimal HTML wrapper)
- Whether to include directory listing when a directory path is requested
- Graceful shutdown behavior on Ctrl+C (SIGINT handling)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no source code exists yet

### Established Patterns
- Research recommends: Fastify v5, CJS entry point (`bin/gsd-browser.cjs`), Node.js >= 20
- Path safety: `path.resolve()` + boundary check with `path.sep` suffix (from ARCHITECTURE.md)
- Project structure: `bin/` (thin CLI entry) + `src/` (server logic) + `public/` (static assets)

### Integration Points
- `bin/gsd-browser.cjs` — CLI entry, parses args, calls `src/server.js`
- `src/server.js` — Fastify instance setup, route registration, listen
- Future Phase 2 adds `src/renderer.js` that hooks into the file serving route
- Future Phase 3 adds `src/sources.js` that replaces the single-path CLI arg with persistent registry

</code_context>

<specifics>
## Specific Ideas

- Startup message should feel like Vite's — one clean line, no clutter
- `--open` flag pattern (opt-in, not opt-out) matches tools like `vite --open`
- Error verbosity appropriate for localhost — no need to hide paths from the developer

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-13*
