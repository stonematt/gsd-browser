# Phase 6: Distribution - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

npx zero-install packaging, npm publication, and startup UX. Anyone can run `npx gsd-browser` with a single command and nothing pre-installed. Covers first-run experience, browser auto-open, startup messaging, and npm package metadata. Does NOT add new features — only packages and publishes what exists.

</domain>

<decisions>
## Implementation Decisions

### First-run experience
- Check CWD for conventions (.planning/, docs/, README.md) when no sources are registered
- If conventions found: auto-register CWD (persist to config, same as `gsd-browser add .`) and start serving
- Auto-open browser on first-run specifically (even before deciding general auto-open)
- Banner should note "(auto-registered)" for transparency
- If CWD has no conventions AND no sources registered: show guided help message with example commands and offer to open the sources management page
- Do NOT offer to add CWD if it has no discoverable conventions — just show help

### Browser auto-open
- Default behavior: always open browser on start
- `--no-open` flag to suppress
- Persistent config option in user config file to flip the default either way (e.g., `{ "open": false }` to default to no-open)
- Config precedence: CLI flag > config file > default (true)

### Startup banner
- Clean one-liner format: `gsd-browser v{version} — http://127.0.0.1:{port}`
- Sources listed below with name and discovered conventions: `  my-project: .planning/, docs/, README.md`
- Auto-registered sources noted with "(auto-registered)" suffix
- Version number read from package.json (already implemented in `--version` flag)

### Package metadata
- Publish as version 0.9.0 — "almost 1.0, get feedback first"
- `files` field: ship only `src/`, `bin/`, `public/`, `README.md`, `LICENSE`
- Add `repository`, `keywords`, `author`, `homepage` fields to package.json
- npm package name: `gsd-browser` (confirmed unclaimed)

### README
- Detailed project README following GitHub best practices
- Set context: what GSD is, why this tool exists, relationship to get-shit-done-cc
- Include dashboard screenshot
- CLI reference with all commands and flags
- Quick start + detailed usage sections

### Claude's Discretion
- Whether to use `open` npm package or `child_process` for browser opening
- Exact wording of guided help message and sources page offer
- README structure and section ordering
- Keywords list for npm
- Whether a LICENSE file needs to be created (MIT declared in package.json)
- Any `.npmignore` vs `files` field approach

</decisions>

<specifics>
## Specific Ideas

- Config file persistence location: `~/Library/Preferences/gsd-browser-nodejs/config.json` (XDG-compliant, established in Phase 3)
- The `open` config option should live in the same config file as sources
- Guided help should mention the sources management page as an alternative to CLI

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/gsd-browser.cjs`: CLI entry point already handles `--open`, `--port`, `--version`, `--help`, and subcommands (add/remove/list)
- `src/sources.js`: `loadConfig()`, `addSource()`, `enrichSourcesWithConventions()` — all needed for first-run auto-add
- `src/server.js`: `start()` accepts `options.open`, already has dynamic import of `open` package with silent failure
- `package.json`: `bin` field already configured correctly

### Established Patterns
- CLI uses `minimist` for argument parsing — add `--no-open` as boolean
- Config persistence via atomic JSON write in `src/sources.js` — extend for `open` preference
- Dynamic ESM import pattern for `open` package (CJS project importing ESM)
- Per-route CSP override pattern if sources page needs special handling

### Integration Points
- `bin/gsd-browser.cjs` lines 118-143: server start path — add first-run CWD detection before the "no sources" error
- `src/server.js` lines 1130-1150: startup message + open logic — update banner format and open default
- `package.json`: add `files`, `repository`, `keywords`, `author`, `homepage`, bump version to 0.9.0

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-distribution*
*Context gathered: 2026-03-29*
