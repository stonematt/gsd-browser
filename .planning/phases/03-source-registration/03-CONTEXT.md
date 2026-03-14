# Phase 3: Source Registration - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage document sources via CLI (`add`, `remove`, `list`) and a minimal web UI, with persistence across server restarts and convention-based discovery of documentation directories. The whole registered repo is browsable — conventions are metadata hints for the future UI. Full browser UI shell (Phase 4), navigation features (Phase 5), and distribution (Phase 6) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Source granularity
- Registering a repo makes the entire directory tree browsable, not just conventional dirs
- Convention dirs (.planning/, docs/, README.md) are stored as metadata on the source — they don't restrict access
- Missing sources on startup: warn to stderr and skip — server starts with whatever is available
- Accept relative paths and resolve to absolute before storing
- Reject duplicate registrations (by resolved path) with a message
- `gsd-browser add` with no path argument defaults to current directory (`.`)

### Discovery feedback
- On `add`, print discovered conventions: "Added /path/to/repo\n  Found: .planning/, docs/, README.md"
- Re-scan conventions on every server start (not just at registration time) — matches fresh-from-disk philosophy
- Conventions are metadata only in Phase 3 — Phase 4 decides how to present them in the UI

### Web UI source management
- Build REST API endpoints (GET/POST/DELETE /api/sources) for source management
- Build a minimal standalone HTML page at `/sources` for managing sources before the Phase 4 UI shell exists
- Simple text input field for adding a path — user pastes/types the filesystem path
- Immediate remove — no confirmation dialog (it's config, not data)
- Relax CSP for the management page (allow scripts) — keep strict CSP on rendered markdown pages
- Phase 4 integrates source management into the full UI shell

### CLI output style
- `gsd-browser list` shows a clean aligned table: NAME, PATH, STATUS (available/missing), CONVENTIONS
- Carries forward Vite-clean aesthetic from Phase 1 — minimal, no clutter

### Source identity
- Auto-label from last directory name segment by default (e.g., /path/to/my-project → "my-project")
- Optional `--name` flag to override the label
- `gsd-browser remove` accepts either label or path
- Ambiguous label matches (multiple sources with same name): print matches and ask user to specify by path

### Claude's Discretion
- Config file location and format (research recommended `conf` package for XDG-compliant persistence)
- API endpoint design details (request/response shapes)
- Management page styling and layout
- How to handle label collisions on `add` (auto-suffix or prompt)
- Server migration from single-root to multi-source architecture

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/filesystem.js`: `isPathAllowed()` and `readFileIfAllowed()` — reuse for validating access per source root
- `src/server.js`: Fastify server with route pattern (`/file`, `/render`, `/`) — add new `/api/sources` and `/sources` routes
- `bin/gsd-browser.cjs`: CLI entry using `minimist` — add subcommand parsing for `add`, `remove`, `list`
- `CSP_HEADER` constant in `server.js` — needs per-route CSP (strict for markdown, relaxed for management page)

### Established Patterns
- CJS modules (`require`/`module.exports`) throughout
- Fastify route pattern: `fastify.get('/path', async (request, reply) => {...})`
- `@fastify/static` for serving public assets
- `node:test` built-in test runner with temp directory fixtures
- Single `registeredRoot` parameter to `createServer()` — needs migration to array of sources

### Integration Points
- New `src/sources.js` (or `src/config.js`): source registry with load/save/add/remove/list
- New `src/discovery.js`: convention scanning (.planning/, docs/, README.md)
- `bin/gsd-browser.cjs`: subcommand routing (add/remove/list vs default server start)
- `src/server.js`: `createServer(registeredRoot)` → `createServer(sources)` — multi-source migration
- `public/sources.html` or server-rendered page at `/sources` for web UI management

</code_context>

<specifics>
## Specific Ideas

- `add .` should just work — natural for devs standing inside a repo
- `list` table output should feel like `docker ps` — aligned, scannable
- Discovery output on `add` should be concise: one line for the source, indented lines for found conventions
- The management page is a bridge — functional but not polished; Phase 4 replaces it with the real UI

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-source-registration*
*Context gathered: 2026-03-13*
