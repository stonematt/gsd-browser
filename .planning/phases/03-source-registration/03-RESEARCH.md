# Phase 3: Source Registration - Research

**Researched:** 2026-03-13
**Domain:** Node.js CLI subcommand parsing, config file persistence, Fastify REST API, multi-source path management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Source granularity**
- Registering a repo makes the entire directory tree browsable, not just conventional dirs
- Convention dirs (.planning/, docs/, README.md) are stored as metadata on the source — they don't restrict access
- Missing sources on startup: warn to stderr and skip — server starts with whatever is available
- Accept relative paths and resolve to absolute before storing
- Reject duplicate registrations (by resolved path) with a message
- `gsd-browser add` with no path argument defaults to current directory (`.`)

**Discovery feedback**
- On `add`, print discovered conventions: "Added /path/to/repo\n  Found: .planning/, docs/, README.md"
- Re-scan conventions on every server start (not just at registration time) — matches fresh-from-disk philosophy
- Conventions are metadata only in Phase 3 — Phase 4 decides how to present them in the UI

**Web UI source management**
- Build REST API endpoints (GET/POST/DELETE /api/sources) for source management
- Build a minimal standalone HTML page at `/sources` for managing sources before the Phase 4 UI shell exists
- Simple text input field for adding a path — user pastes/types the filesystem path
- Immediate remove — no confirmation dialog (it's config, not data)
- Relax CSP for the management page (allow scripts) — keep strict CSP on rendered markdown pages
- Phase 4 integrates source management into the full UI shell

**CLI output style**
- `gsd-browser list` shows a clean aligned table: NAME, PATH, STATUS (available/missing), CONVENTIONS
- Carries forward Vite-clean aesthetic from Phase 1 — minimal, no clutter

**Source identity**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRC-01 | User can register a repo/directory as a document source via `gsd-browser add <path>` | CLI subcommand via `argv._[0]` with minimist; `path.resolve()` for absolute; `fs.stat()` for validation |
| SRC-02 | User can remove a registered source via `gsd-browser remove <path>` | Same CLI pattern; accept label or resolved path; ambiguous match handled in sources.js |
| SRC-03 | User can list registered sources via `gsd-browser list` | Table formatting with manual column alignment; reads sources.json |
| SRC-04 | Registered sources persist across server restarts (config file in OS-appropriate location) | Pure Node.js built-ins: `os.homedir()`, `fs.mkdirSync()`, atomic write (writeFile + renameSync) |
| SRC-05 | Registered repos auto-discover `.planning/`, `docs/`, and `README.md` by convention | `fs.existsSync()` checks at registration time and on every server start |
| SRC-06 | User can add/remove sources from the web UI (not just CLI) | Fastify GET/POST/DELETE /api/sources; server-rendered or static HTML at /sources with relaxed CSP |
</phase_requirements>

---

## Summary

Phase 3 adds multi-source management to a working single-root Fastify server. The core challenge is threefold: (1) CLI subcommand routing on top of the existing `minimist` argument parser, (2) OS-appropriate persistent config file without external dependencies (the previously recommended `conf` package is ESM-only and incompatible with this CJS codebase), and (3) migrating `createServer(registeredRoot)` to accept an array of source objects while keeping existing tests green.

The research confirms that all config persistence can be done with pure Node.js built-ins in under 30 lines: `os.homedir()` + `XDG_CONFIG_HOME` for the directory, `fs.mkdirSync({recursive: true})` for creation, and a write-then-rename pattern for atomic saves. The Fastify per-route `onSend` hook reliably overrides global `preHandler` headers, enabling strict CSP on markdown pages and relaxed CSP on the `/sources` management page — verified by live test against the installed Fastify v5.

**Primary recommendation:** Implement config persistence with pure Node.js built-ins (no new dependencies). Use minimist `argv._[0]` subcommand dispatch. Migrate `createServer()` to accept `sources[]` array. Add REST endpoints + a server-rendered `/sources` HTML page. Use per-route `onSend` to selectively relax CSP.

---

## Standard Stack

### Core (already installed — no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minimist` | ^1.2.8 | CLI argument parsing | Already used in `bin/gsd-browser.cjs`; `argv._[0]` for subcommand dispatch |
| `node:os` | built-in | `os.homedir()` for config path | No external package needed |
| `node:fs/promises` | built-in | Async config read/write | Already used throughout |
| `node:fs` | built-in | Sync `existsSync()` for convention checks | Standard pattern |
| `node:path` | built-in | `path.resolve()`, `path.basename()` | Already used |
| `fastify` | ^5.8.2 | REST API routes, per-route hooks | Already installed |

### Critical Finding: `conf` Package is ESM-Only

**DECISION: Do NOT use `conf`.**

The `conf` npm package (current version: 15.1.0) has `"type": "module"` in its package.json and no CommonJS export (`"main"` is undefined). This project uses CJS (`require`/`module.exports`) throughout. Using `conf` would require either:
- Converting the entire codebase to ESM (out of scope)
- Using `await import('conf')` which makes the synchronous config load pattern async (adds complexity for no benefit)

**All functionality `conf` provides can be replicated in <30 lines of native Node.js.** See Code Examples below.

Similarly, `env-paths` (v4.0.0) is also ESM-only. Manual XDG path computation is 3 lines.

### What conf would have provided (now done manually)
| Feature | Manual Implementation |
|---------|----------------------|
| XDG-compliant config path | `process.env.XDG_CONFIG_HOME \|\| path.join(os.homedir(), '.config')` |
| Atomic writes | `fs.writeFile(tmpPath) + fs.rename(tmpPath, configPath)` |
| Auto-create config dir | `fs.mkdirSync(dir, { recursive: true })` |
| JSON serialization | `JSON.stringify(data, null, 2)` / `JSON.parse(content)` |

---

## Architecture Patterns

### New Files to Create
```
src/
├── sources.js        # Source registry: load/save/add/remove/list, convention scanning
bin/
├── gsd-browser.cjs   # Extend: subcommand routing (add/remove/list vs server start)
src/
├── server.js         # Migrate: createServer(registeredRoot) → createServer(sources[])
public/
├── sources.html      # Management page (static or server-rendered at /sources)
test/
├── sources.test.js   # Tests for sources.js functions
```

### Pattern 1: CLI Subcommand Dispatch with minimist

**What:** Check `argv._[0]` to route to add/remove/list before defaulting to server-start behavior.
**When to use:** Any CLI that adds subcommands on top of existing minimist parsing.

```javascript
// Source: verified minimist pattern from npm docs + project existing code
'use strict';
const minimist = require('minimist');

const args = minimist(process.argv.slice(2), {
  string: ['port', 'name'],
  boolean: ['open', 'help', 'version'],
  alias: { p: 'port', h: 'help', v: 'version', n: 'name' }
});

const subcommand = args._[0]; // 'add', 'remove', 'list', or undefined

if (subcommand === 'add') {
  const targetPath = args._[1] || '.'; // default to cwd
  await cmdAdd(targetPath, { name: args.name });
} else if (subcommand === 'remove') {
  const target = args._[1];
  if (!target) { process.stderr.write('Usage: gsd-browser remove <path|name>\n'); process.exit(1); }
  await cmdRemove(target);
} else if (subcommand === 'list') {
  await cmdList();
} else {
  // Original server-start behavior
  await cmdServe(args);
}
```

### Pattern 2: Config File Persistence (Pure Node.js built-ins)

**What:** XDG-compliant JSON config file at `~/.config/gsd-browser/sources.json` on Linux/macOS, atomic writes.
**When to use:** Any CJS tool that needs cross-restart persistence without adding dependencies.

```javascript
// Source: Node.js built-in docs — verified working pattern
'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

function getConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'gsd-browser', 'sources.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { sources: [] }; // file missing = empty config
  }
}

function saveConfig(data) {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true }); // idempotent
  const tmpPath = configPath + '.tmp';
  // Atomic write: write to .tmp then rename (crash-safe)
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, configPath);
}
```

**Config file format:**
```json
{
  "sources": [
    {
      "name": "my-project",
      "path": "/Users/alice/code/my-project",
      "addedAt": "2026-03-13T10:00:00.000Z"
    }
  ]
}
```

### Pattern 3: Convention Discovery

**What:** For each registered source, check for `.planning/`, `docs/`, and `README.md` at startup.
**When to use:** Re-scan on every server start (not just at registration time).

```javascript
// Source: Node.js built-in docs
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CONVENTIONS = ['.planning', 'docs', 'README.md'];

function discoverConventions(sourcePath) {
  return CONVENTIONS.filter(name =>
    fs.existsSync(path.join(sourcePath, name))
  );
}

// Called at registration time (for user feedback) AND at server start
function enrichSourcesWithConventions(sources) {
  return sources.map(source => ({
    ...source,
    conventions: discoverConventions(source.path),
    available: fs.existsSync(source.path),
  }));
}
```

### Pattern 4: Multi-Source Migration in createServer()

**What:** Migrate `createServer(registeredRoot)` to `createServer(sources)` where `sources` is an array of enriched source objects.
**When to use:** Required for multi-source path traversal checks.

```javascript
// Migration of isPathAllowed to work across multiple source roots
async function isPathAllowedInAnySource(requestedPath, sources) {
  for (const source of sources) {
    if (!source.available) continue;
    const allowed = await isPathAllowed(requestedPath, source.path);
    if (allowed) return { allowed: true, source };
  }
  return { allowed: false, source: null };
}
```

### Pattern 5: Per-Route CSP Override with Fastify onSend

**What:** Override the global `preHandler` CSP header for specific routes. Verified working against Fastify v5.
**When to use:** The `/sources` management page needs `script-src 'self'` while markdown render pages need `script-src 'none'`.

```javascript
// Source: Verified by live test against installed fastify v5.8.2
const MANAGEMENT_CSP = "default-src 'self'; script-src 'self'; object-src 'none'";

fastify.get('/sources', {
  onSend: async (request, reply, payload) => {
    // Runs after global preHandler — overrides the strict CSP
    reply.header('Content-Security-Policy', MANAGEMENT_CSP);
    return payload;
  }
}, async (request, reply) => {
  // Handler serves the management page HTML
  return reply.header('Content-Type', 'text/html; charset=utf-8').send(managementPageHtml);
});

// Same pattern for POST/DELETE /api/sources routes
```

### Pattern 6: REST API Endpoints (Fastify)

**What:** Three endpoints for source management.
**When to use:** Called by the `/sources` management page via fetch().

```javascript
// GET /api/sources — list all sources with status
fastify.get('/api/sources', async (request, reply) => {
  const config = loadConfig();
  const enriched = enrichSourcesWithConventions(config.sources);
  return reply.send({ sources: enriched });
});

// POST /api/sources — add a source
fastify.post('/api/sources', async (request, reply) => {
  const { path: sourcePath, name } = request.body;
  // validate, resolve, check duplicate, add, save
  return reply.code(201).send({ source: newSource });
});

// DELETE /api/sources/:name — remove by name or path
fastify.delete('/api/sources/:identifier', async (request, reply) => {
  const { identifier } = request.params;
  // remove by name or path match
  return reply.code(200).send({ removed: source });
});
```

**Note on DELETE with body:** Fastify may throw JSON parse errors if a DELETE route has no body schema defined and client sends no body. Use URL params (`:identifier`) instead of request body for DELETE — this is the REST-standard approach and avoids the Fastify DELETE-body pitfall.

### Pattern 7: `list` CLI Table Formatting

**What:** Docker-ps style aligned table output.
**When to use:** `gsd-browser list` command.

```javascript
// No external library needed — manual column alignment
function formatTable(sources) {
  const rows = sources.map(s => [
    s.name,
    s.path,
    s.available ? 'available' : 'missing',
    s.conventions.join(', ') || '—'
  ]);
  // Compute column widths
  const headers = ['NAME', 'PATH', 'STATUS', 'CONVENTIONS'];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length))
  );
  const fmt = row => row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  const lines = [fmt(headers), fmt(widths.map(w => '-'.repeat(w))), ...rows.map(fmt)];
  return lines.join('\n') + '\n';
}
```

### Anti-Patterns to Avoid

- **Installing `conf` or `env-paths`:** Both are ESM-only as of their current versions (conf v15, env-paths v4). Do not install. Use pure Node.js built-ins.
- **Storing conventions at registration time only:** Re-scan on every server start per locked decision.
- **Blocking all access until sources loaded:** If config file missing, treat as zero sources (not an error).
- **Using fs.renameSync across filesystems:** The atomic write pattern (write .tmp then rename) only works atomically if both files are on the same filesystem — `os.tmpdir()` may be on a different device. Write the `.tmp` file alongside the config file (same directory) to guarantee same-device rename.
- **Modifying `isPathAllowed()` signature:** Keep the existing function pure. Add a new multi-source wrapper that loops over sources.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic config write | Custom locking/mutex | `writeFile(tmp) + renameSync(tmp, target)` | OS-level atomic rename; crash-safe |
| Column-aligned table | Complex formatter | `String.padEnd(width)` | 10 lines max; no library needed |
| URL-safe path encoding | Custom encoding | `encodeURIComponent()` | Built-in; handles all edge cases |
| Directory creation | Recursive mkdir loop | `fs.mkdirSync(dir, { recursive: true })` | Built-in since Node.js 10 |

**Key insight:** This phase adds zero new dependencies. All required functionality exists in Node.js built-ins or already-installed packages.

---

## Common Pitfalls

### Pitfall 1: `conf` Is ESM-Only (Critical)
**What goes wrong:** `require('conf')` throws `ERR_REQUIRE_ESM` at runtime.
**Why it happens:** `conf` v13+ is pure ESM (`"type": "module"`); no CJS export exists. `env-paths` v4 has the same issue.
**How to avoid:** Use pure Node.js built-ins as shown in Pattern 2. Verified: `conf` v15.1.0 has `"type": "module"` and no `"main"` field.
**Warning signs:** If `npm install conf` is proposed in any task, reject it.

### Pitfall 2: DELETE Route Body Parsing Error
**What goes wrong:** Fastify throws a JSON parse error when a DELETE request arrives with no body and the route schema expects a body.
**Why it happens:** Fastify v5 strict JSON parsing; DELETE with no body and no schema definition can error.
**How to avoid:** Use URL params (`:identifier`) for the DELETE endpoint. Do NOT send a JSON body for DELETE.
**Warning signs:** `"FST_ERR_CTP_INVALID_MEDIA_TYPE"` or `"SyntaxError: Unexpected end of JSON input"` in DELETE handler tests.

### Pitfall 3: CSP Override Timing (preHandler vs onSend)
**What goes wrong:** Setting CSP in route handler body doesn't override the global `preHandler` CSP because `preHandler` runs after the route handler sets headers (or in wrong order).
**Why it happens:** Fastify lifecycle: onRequest → preHandler → handler → onSend → response. The global `preHandler` sets CSP before the handler runs, but `onSend` runs after and can override.
**How to avoid:** Use per-route `onSend` hook for the `/sources` and `/api/sources` routes. Verified working against Fastify v5.
**Warning signs:** Management page still gets `script-src 'none'` CSP.

### Pitfall 4: Same-Device Rename for Atomic Write
**What goes wrong:** `fs.renameSync(tmpFile, configFile)` throws `EXDEV: cross-device link not permitted`.
**Why it happens:** `os.tmpdir()` may be on a different filesystem (e.g., `/tmp` on RAM disk on macOS). Rename across devices is not atomic.
**How to avoid:** Write `.tmp` to `configDir + '/sources.json.tmp'` (same directory as config file, guaranteed same device).
**Warning signs:** `EXDEV` error on macOS or Linux with `/tmp` on a separate tmpfs.

### Pitfall 5: createServer() Signature Migration Breaks Existing Tests
**What goes wrong:** Existing tests pass a single string `testDir` to `createServer(testDir)`. After migration to `createServer(sources[])`, all existing tests break.
**Why it happens:** Signature change.
**How to avoid:** Migration must maintain backward compatibility in the test setup OR update all test fixtures to pass `[{ name: 'test', path: testDir, available: true, conventions: [] }]`. Plan for test migration explicitly.
**Warning signs:** `TypeError: sources.map is not a function` in test output.

### Pitfall 6: Duplicate Name Auto-Suffix vs Prompt (Claude's Discretion)
**What goes wrong:** Two repos named `my-project` register with the same auto-label.
**Why it happens:** `path.basename()` on `/alice/my-project` and `/bob/my-project` both produce `my-project`.
**How to avoid:** Auto-suffix with `-2`, `-3` etc. (like most CLI tools). Do NOT prompt interactively — npx/pipe contexts can't handle prompts.
**Warning signs:** `gsd-browser list` shows duplicate NAME entries.

---

## Code Examples

### Config Path on macOS and Linux
```javascript
// Source: Node.js os docs — verified by running against Node.js v25.8.1
const os = require('node:os');
const path = require('node:path');

// macOS: /Users/alice/.config/gsd-browser/sources.json
// Linux: /home/alice/.config/gsd-browser/sources.json (or $XDG_CONFIG_HOME)
// Windows: %APPDATA%\gsd-browser\sources.json — note: XDG_CONFIG_HOME not standard
function getConfigPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'gsd-browser', 'sources.json');
}
```

### Fastify per-route onSend CSP override (Verified)
```javascript
// Source: Verified by live test against fastify v5.8.2 installed in project
// Result: /relaxed CSP = "script-src 'self'", /strict CSP = "script-src 'none'"
const MANAGEMENT_CSP = "default-src 'self'; script-src 'self'; object-src 'none'";

fastify.get('/sources', {
  onSend: async (request, reply, payload) => {
    reply.header('Content-Security-Policy', MANAGEMENT_CSP);
    return payload;
  }
}, async (request, reply) => {
  return reply.type('text/html').send(sourcesPageHtml);
});
```

### Convention discovery
```javascript
// Source: Node.js fs docs — standard pattern
const CONVENTIONS = ['.planning', 'docs', 'README.md'];

function discoverConventions(sourcePath) {
  return CONVENTIONS.filter(name => {
    try {
      fs.statSync(path.join(sourcePath, name)); // works for both files and dirs
      return true;
    } catch {
      return false;
    }
  });
}
// Prefer statSync over existsSync: statSync distinguishes ENOENT from EACCES
```

### add command feedback format
```
Added /Users/alice/code/my-project
  Found: .planning/, docs/, README.md
```

### list table format (docker ps style)
```
NAME         PATH                              STATUS     CONVENTIONS
-----------  --------------------------------  ---------  ----------------------
my-project   /Users/alice/code/my-project      available  .planning/, docs/, README.md
other-repo   /Users/alice/code/other-repo      missing    —
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `conf` for config persistence | Pure Node.js built-ins (conf is ESM-only) | conf v13, 2022 | Must implement manually; ~25 lines |
| Single registered root | Array of sources | This phase | `createServer()` signature changes |
| Server-start-only operation | Subcommand dispatch (add/remove/list) | This phase | `bin/gsd-browser.cjs` needs restructure |
| Path traversal check vs. one root | Multi-root check loop | This phase | New `isPathAllowedInAnySource()` wrapper |

**Deprecated/outdated:**
- `registeredRoot` parameter name: Replace with `sources` array throughout
- `conf` package recommendation from earlier research: ESM incompatibility makes it unusable; use built-ins

---

## Open Questions

1. **Label collision strategy (Claude's Discretion)**
   - What we know: `path.basename()` produces duplicate labels when two repos share a name
   - What's unclear: Auto-suffix vs prompt; prompt is problematic in npx/pipe contexts
   - Recommendation: Auto-suffix with `-2`, `-3` (no prompt). Deterministic and pipe-safe.

2. **DELETE endpoint identifier format**
   - What we know: REST convention is URL params; Fastify DELETE body parsing can error
   - What's unclear: Whether to use name, path, or either
   - Recommendation: `DELETE /api/sources/:name` — name is stable, human-readable, URL-safe after `encodeURIComponent()`. Support path as fallback in server logic.

3. **Management page: static file vs server-rendered**
   - What we know: `@fastify/static` serves `public/` already; management page needs dynamic source list
   - What's unclear: Whether to fetch sources via JS + REST API (static HTML + JS) or server-render the full page
   - Recommendation: Static `public/sources.html` with embedded `<script>` that calls `GET /api/sources` on load. Keeps server logic clean. Consistent with Phase 4 replacing it entirely.

4. **`/sources` route conflict with @fastify/static**
   - What we know: `@fastify/static` is registered with `prefix: '/'` and serves `public/`
   - What's unclear: Whether an explicit `fastify.get('/sources', ...)` route shadows the static plugin for that path
   - Recommendation: Register the `/sources` route AFTER `@fastify/static` registration. Explicit routes shadow static for same paths in Fastify — this is the desired behavior (route wins over static).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) |
| Config file | none — `"test": "node --test test/"` in package.json |
| Quick run command | `node --test test/sources.test.js` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRC-01 | `add <path>` registers a source (resolved absolute path stored) | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-01 | `add .` defaults to cwd | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-01 | Duplicate registration rejected with message | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-02 | `remove <path>` removes a source | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-02 | `remove <name>` removes by label | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-03 | `list` prints NAME, PATH, STATUS, CONVENTIONS | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-04 | Config persists across process restarts (write + read round-trip) | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-04 | Missing sources on startup: warn + skip (server starts) | integration | `node --test test/server.test.js` | Wave 0 |
| SRC-05 | .planning/, docs/, README.md discovered and stored as metadata | unit | `node --test test/sources.test.js` | Wave 0 |
| SRC-05 | Conventions re-scanned on server start | integration | `node --test test/server.test.js` | Wave 0 |
| SRC-06 | `GET /api/sources` returns sources array with status | integration | `node --test test/server.test.js` | Wave 0 |
| SRC-06 | `POST /api/sources` adds a source | integration | `node --test test/server.test.js` | Wave 0 |
| SRC-06 | `DELETE /api/sources/:name` removes a source | integration | `node --test test/server.test.js` | Wave 0 |
| SRC-06 | `/sources` page returns 200 with relaxed CSP (`script-src 'self'`) | integration | `node --test test/server.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/sources.test.js`
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/sources.test.js` — covers SRC-01 through SRC-05 unit tests; shared temp-dir fixture pattern from existing tests
- [ ] `src/sources.js` — the module being tested (created in Wave 1, tested from Wave 0 scaffolding)

*(Existing test infrastructure: node:test, temp-dir fixtures via `os.tmpdir()` + `fs.mkdtemp()`, `fastify.inject()` for server tests — all patterns established in Phase 1/2 tests. No new test infrastructure needed.)*

---

## Sources

### Primary (HIGH confidence)
- Node.js built-in docs (os, fs, path) — verified by live code execution against Node.js v25.8.1
- `npm info conf --json` — confirmed version 15.1.0, `"type": "module"`, no CJS export
- `npm info env-paths --json` — confirmed version 4.0.0, `"type": "module"` (also ESM-only)
- Live Fastify test — per-route `onSend` CSP override verified against fastify v5.8.2
- Existing project code — `bin/gsd-browser.cjs`, `src/server.js`, `src/filesystem.js`, `test/server.test.js`

### Secondary (MEDIUM confidence)
- [Fastify Hooks docs](https://fastify.dev/docs/latest/Reference/Hooks/) — onSend hook per-route behavior
- [Fastify Routes docs](https://fastify.dev/docs/latest/Reference/Routes/) — route-level hook array syntax
- [sindresorhus/conf GitHub](https://github.com/sindresorhus/conf) — ESM-only status confirmed

### Tertiary (LOW confidence)
- WebSearch results for minimist subcommand patterns — corroborates `argv._[0]` approach but no single authoritative source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by npm registry queries and live code execution
- Architecture: HIGH — all patterns tested against installed dependencies
- Pitfalls: HIGH for conf/env-paths ESM issue (verified); HIGH for Fastify CSP override (verified); MEDIUM for DELETE body pitfall (official issue + docs)
- Config persistence: HIGH — atomic write pattern verified by live execution

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable Node.js built-ins; `conf` ESM-only status is permanent)
