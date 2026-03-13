# Phase 1: Foundation - Research

**Researched:** 2026-03-13
**Domain:** Fastify v5 HTTP server — localhost binding, path traversal protection, security headers, CLI arg parsing, port conflict handling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Initial serving behavior**
- Server accepts a positional directory argument: `gsd-browser ./my-repo`
- Serves any file type within the allowed directory (not just .md) with appropriate MIME types
- Path argument is required; running with no args prints help/usage

**Error response format**
- All errors return JSON: `{ error: "message", status: 403, requested: "/path", allowed: ["/sources"] }`
- Developer-verbose — include the requested path, allowed source roots, and reason for rejection
- This is a localhost-only dev tool; verbose errors aid debugging without security risk

**Port conflict handling**
- Fail-fast with clear stderr message: `Port 3000 in use. Try --port 3001`
- Exit with non-zero code
- No auto-retry or port scanning

**CLI startup message**
- Minimal one-liner on stdout: `gsd-browser serving ./my-repo at http://127.0.0.1:XXXX`
- No ASCII box or banner — clean like Vite's startup

**Browser auto-open**
- No auto-open by default
- `--open` flag to opt in to opening the browser on start

**CLI flags in Phase 1**
- `--port` to set custom port
- `--open` to auto-open browser
- `--help` with usage info
- `--version` with package version

### Claude's Discretion

- Default port number (something that avoids common 3000-range dev server collisions)
- Response format for markdown files in Phase 1 (raw text vs minimal HTML wrapper)
- Whether to include directory listing when a directory path is requested
- Graceful shutdown behavior on Ctrl+C (SIGINT handling)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-04 | Every page load reads fresh file content from disk (no caching) | `Cache-Control: no-store` header on all file responses; `fs.promises.readFile()` on every request; no in-memory content cache |
| SERV-05 | Server port is configurable via `--port` flag | `process.argv` parsing or `minimist`; `fastify.listen({ port, host })` accepts the parsed value; EADDRINUSE caught in listen callback |
| SERV-06 | Server binds to localhost only (127.0.0.1) | `fastify.listen({ host: '127.0.0.1', port })` — explicit host required; default 'localhost' resolves to ::1 on some systems |
| SERV-07 | Path traversal protection prevents access outside registered sources | `path.resolve()` + `fs.promises.realpath()` + `startsWith(base + path.sep)` — all three steps required; `path.normalize()` alone is insufficient |
| SERV-08 | CSP headers prevent XSS from rendered markdown content | `reply.header('Content-Security-Policy', "default-src 'self'; script-src 'none'")` set globally via `addHook('preHandler', ...)` |
</phase_requirements>

---

## Summary

Phase 1 builds the security foundation that all later phases depend on. The five requirements map to four distinct implementation areas: (1) localhost-only binding with `host: '127.0.0.1'`, (2) global security headers (CSP + Cache-Control) via a Fastify `preHandler` hook, (3) path traversal protection using the `path.resolve()` + `fs.realpath()` + boundary check pattern, and (4) CLI arg parsing with `--port`, `--open`, `--help`, `--version` flags and EADDRINUSE error handling.

The existing project-level research (STACK.md, ARCHITECTURE.md, PITFALLS.md) already covers these patterns in detail. This phase research deepens those findings specifically for Phase 1's scope: a single-source file server (Phase 3 brings multi-source persistence), no markdown rendering (Phase 2), no frontend (Phase 4). The CLI in Phase 1 takes a positional directory argument rather than managing a registry.

One discretionary decision needs to be made: the default port. Port 3000 conflicts with many dev servers (Vite often uses 5173, but React dev servers, Rails, Sinatra, and others use 3000). Port 4242 or 7331 are viable choices that avoid the crowded 3000–3100 and 5000–5500 ranges. This research recommends **port 4242** — memorable, collision-rare, and within the ephemeral-safe range.

**Primary recommendation:** Use Fastify v5 `fastify.listen({ port, host: '127.0.0.1' })`, a root-level `addHook('preHandler', ...)` for global headers, and the `path.resolve()` + `fs.realpath()` boundary check for every file request. These three patterns satisfy all five Phase 1 requirements with verified, high-confidence APIs.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.8 | HTTP server | Verified current stable (v5.8.x as of 2026-03); explicit host binding; hook system for global headers; built-in JSON schema for error responses |
| Node.js built-in `path` | (built-in) | Path normalization and boundary check | `path.resolve()` required for traversal protection; never string concatenation |
| Node.js built-in `fs/promises` | (built-in) | File reads and `realpath()` | `fs.promises.realpath()` required to resolve symlinks before boundary check; `fs.promises.readFile()` for disk-fresh content |
| Node.js built-in `process` | (built-in) | `argv` parsing, exit codes, signal handling | `process.argv`, `process.exit(1)` for EADDRINUSE fail-fast |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| minimist | ^1.2 | CLI argument parsing | Lightweight positional + flag parser; zero dependencies; sufficient for Phase 1's simple flag set |
| mime-types | ^2.1 | MIME type lookup for file responses | Maps file extensions to `Content-Type` values; needed to serve non-.md files correctly |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| minimist | yargs / commander | yargs and commander are fuller-featured but overkill for 4 flags; minimist is 1KB with no deps |
| minimist | process.argv manual parse | Manual parsing is error-prone; minimist handles `--port 3001`, `--port=3001`, `-p 3001` correctly |
| mime-types | @fastify/static (for MIME) | @fastify/static handles MIME automatically when serving from a static root; but Phase 1 uses a dynamic file route, not a static root |

**Installation:**

```bash
npm install fastify minimist mime-types
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)

```
gsd-browser/
├── bin/
│   └── gsd-browser.cjs       # CLI entry; parses argv; calls src/server.js
├── src/
│   ├── server.js              # Fastify instance, hooks, route registration, listen
│   └── filesystem.js          # readFile, path safety validation (isPathAllowed)
├── package.json               # "bin", "engines": { "node": ">=20" }, "main": "src/server.js"
└── test/
    └── server.test.js         # Integration tests for security requirements
```

**Phase 1 is intentionally minimal.** `renderer.js`, `sources.js`, and `routes/` subdirectory are NOT created in this phase — they are integration points for Phase 2 and Phase 3. Starting minimal avoids scaffolding code that will be replaced.

### Pattern 1: Fastify Server Initialization with Localhost Binding

**What:** Create a Fastify instance and call `listen()` with an explicit `host: '127.0.0.1'`. Never rely on the default 'localhost', which can resolve to `::1` (IPv6) on macOS and Linux.

**When to use:** Always, unconditionally. The requirement is `127.0.0.1` binding, not `localhost`.

```javascript
// src/server.js
const fastify = require('fastify')({ logger: false });

async function start(port, rootPath) {
  await fastify.listen({ port, host: '127.0.0.1' });
  process.stdout.write(`gsd-browser serving ${rootPath} at http://127.0.0.1:${port}\n`);
}

module.exports = { start };
```

### Pattern 2: Global Security Headers via preHandler Hook

**What:** Register a root-level `addHook('preHandler', ...)` that sets `Content-Security-Policy` and `Cache-Control` on every response. Because the hook is registered at the root level (not inside a plugin), it applies to all routes.

**When to use:** All responses from gsd-browser in Phase 1. Both headers are requirements.

```javascript
// src/server.js — registered before any routes
fastify.addHook('preHandler', (request, reply, done) => {
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none'");
  reply.header('Cache-Control', 'no-store');
  done();
});
```

**Why `preHandler` not `onSend`:** `preHandler` is more appropriate for setting response headers since it runs before the route handler executes. `onSend` is designed for payload transformation. Both work for header mutation, but `preHandler` is the documented pattern for global header policy.

**CSP value rationale:** `default-src 'self'` allows resources from the same origin (the server's own static assets in future phases). `script-src 'none'` blocks all JavaScript execution in served content — the correct policy for Phase 1 when no client-side JS exists yet. This will need adjustment in Phase 4 when the vanilla JS frontend is added (change to `script-src 'self'`).

### Pattern 3: Path Traversal Protection — Three-Step Boundary Check

**What:** For every file request, resolve the absolute path, then use `fs.realpath()` to follow symlinks, then assert the result starts with the registered root (with path separator appended to prevent prefix-collision attacks).

**When to use:** Every single file serving request. No exceptions.

```javascript
// src/filesystem.js
const path = require('node:path');
const fs = require('node:fs/promises');

/**
 * Checks whether a requested file path is within the allowed root.
 * All three steps are required — omitting any one creates a vulnerability.
 */
async function isPathAllowed(requestedPath, registeredRoot) {
  try {
    const realBase = await fs.realpath(path.resolve(registeredRoot));
    const realTarget = await fs.realpath(path.resolve(registeredRoot, requestedPath));
    return realTarget.startsWith(realBase + path.sep);
  } catch (err) {
    // realpath throws if file does not exist — treat as not allowed
    return false;
  }
}

/**
 * Reads a file only if it is within the allowed root.
 * Returns null if path is outside root (caller returns 403).
 */
async function readFileIfAllowed(requestedPath, registeredRoot) {
  const allowed = await isPathAllowed(requestedPath, registeredRoot);
  if (!allowed) return null;
  // Use realpath-resolved path to prevent TOCTOU
  const realBase = await fs.realpath(path.resolve(registeredRoot));
  const normalized = path.resolve(registeredRoot, requestedPath);
  return await fs.readFile(normalized, 'utf8');
}

module.exports = { isPathAllowed, readFileIfAllowed };
```

**Why `fs.realpath()` in addition to `path.resolve()`:**
- `path.resolve()` handles `../` sequences syntactically
- `fs.realpath()` follows symlinks — a symlink inside the registered root pointing outside it would bypass `path.resolve()` alone
- This is documented in CVE-2023-26111 (node-static) and CVE-2025-27210 (Windows device names)

### Pattern 4: EADDRINUSE Fail-Fast with Human-Readable Error

**What:** Catch the `EADDRINUSE` error in the Fastify `listen()` callback (or catch block) and print a clear message to stderr before exiting with code 1. No retry, no auto-scanning.

**When to use:** Always. Raw Node.js stack traces on port conflict are unacceptable UX.

```javascript
// bin/gsd-browser.cjs
const { start } = require('../src/server.js');
const args = require('minimist')(process.argv.slice(2));
const port = args.port || 4242;

start(port, args._[0]).catch((err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} in use. Try --port ${port + 1}\n`);
    process.exit(1);
  }
  process.stderr.write(`Failed to start: ${err.message}\n`);
  process.exit(1);
});
```

**Note:** Fastify's `listen()` returns a Promise when no callback is passed. The `EADDRINUSE` error code is propagated as `err.code` in both callback and async/await patterns.

### Pattern 5: JSON Error Responses

**What:** All error responses use the locked format: `{ error: "message", status: 403, requested: "/path", allowed: ["/sources"] }`. In Phase 1, the `allowed` array contains the single registered root.

```javascript
// src/server.js — file serving route
fastify.get('/file', async (request, reply) => {
  const { path: requestedPath } = request.query;
  const allowed = await isPathAllowed(requestedPath, serverRoot);
  if (!allowed) {
    return reply.status(403).send({
      error: 'Path is outside the registered source root',
      status: 403,
      requested: requestedPath,
      allowed: [serverRoot]
    });
  }
  // ... serve file
});
```

### Pattern 6: CLI Entry Point (CJS with shebang)

**What:** The `bin/gsd-browser.cjs` file uses a `#!/usr/bin/env node` shebang, parses argv with `minimist`, validates the required positional argument, and calls `src/server.js`. The file must be marked executable (`chmod +x`).

```javascript
#!/usr/bin/env node
'use strict';

const args = require('minimist')(process.argv.slice(2), {
  string: ['port'],
  boolean: ['open', 'help', 'version'],
  alias: { p: 'port', h: 'help', v: 'version' }
});

if (args.version) {
  const { version } = require('../package.json');
  process.stdout.write(`gsd-browser v${version}\n`);
  process.exit(0);
}

if (args.help || args._.length === 0) {
  process.stdout.write([
    'Usage: gsd-browser <directory> [options]',
    '',
    'Options:',
    '  --port, -p   Port to listen on (default: 4242)',
    '  --open       Open browser on start',
    '  --version    Print version',
    '  --help       Print this message',
    ''
  ].join('\n'));
  process.exit(args.help ? 0 : 1);
}

const { start } = require('../src/server.js');
const port = parseInt(args.port, 10) || 4242;
const rootPath = args._[0];

start(port, rootPath, { open: args.open }).catch((err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} in use. Try --port ${port + 1}\n`);
    process.exit(1);
  }
  process.stderr.write(`Failed to start: ${err.message}\n`);
  process.exit(1);
});
```

### Anti-Patterns to Avoid

- **`fastify.listen(port)` without a host argument:** Binds to 'localhost', which resolves to `::1` on some systems. Always pass `host: '127.0.0.1'` explicitly.
- **`path.normalize()` alone for traversal protection:** Resolves `../` syntactically but does not follow symlinks or verify the result is inside the root.
- **`path.join(root, userInput).startsWith(root)`:** Prefix collision — `/home/user/repo` prefix matches `/home/user/repo-evil/`. Always append `path.sep` to the base before the `startsWith` check.
- **Setting headers in `onSend` for policy headers:** Works, but `preHandler` is cleaner for headers that are policy rather than payload-derived.
- **`process.argv.slice(2)` string splitting:** Manual arg parsing mishandles `--port=3001` vs `--port 3001`. Use `minimist`.
- **`console.log` for startup message:** Use `process.stdout.write()` for precise output control without the trailing newline behavior of `console.log`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI arg parsing | Custom `process.argv` parser | `minimist` | Handles `--flag=value`, `-f value`, boolean flags, aliases correctly; 1KB, no deps |
| MIME type lookup | Custom extension → Content-Type map | `mime-types` | Covers 900+ types including edge cases; maintained |
| Path traversal boundary check | Custom string manipulation | `path.resolve()` + `fs.realpath()` (Node built-ins) | Custom string checks miss symlinks, Windows device names, URL encoding edge cases |

**Key insight:** The path traversal protection logic is the most dangerous thing to hand-roll in this phase. Use the established `path.resolve()` + `fs.realpath()` + `startsWith(base + path.sep)` pattern exactly as specified. Deviating from this pattern is how CVEs happen.

---

## Common Pitfalls

### Pitfall 1: `localhost` vs `127.0.0.1` binding

**What goes wrong:** `fastify.listen({ port, host: 'localhost' })` binds to `::1` (IPv6 loopback) on macOS and many Linux systems, not `127.0.0.1`. The requirement is IPv4 localhost-only.

**Why it happens:** 'localhost' is ambiguous — it resolves via the OS hosts file, which typically maps to `::1` on modern systems.

**How to avoid:** Always use `host: '127.0.0.1'` — the literal IPv4 loopback address, not the hostname 'localhost'.

**Warning signs:** Server "works" but `curl http://127.0.0.1:PORT` fails while `curl http://localhost:PORT` works (or vice versa).

### Pitfall 2: Path prefix collision without `path.sep`

**What goes wrong:** `resolved.startsWith(base)` allows `/home/user/my-repo-backup/` when the registered root is `/home/user/my-repo`.

**Why it happens:** String prefix match without requiring the separator after the base path.

**How to avoid:** Always check `resolved.startsWith(base + path.sep)`. Also verify the `resolved` path itself is not equal to `base` when checking if a *file* (not the root itself) is within the root.

**Warning signs:** Test: register `/tmp/test-repo`, then request path `../test-repo-evil/secret.txt` — if it returns file content, you have this bug.

### Pitfall 3: Symlink bypass of boundary check

**What goes wrong:** A symlink at `/tmp/test-repo/link` points to `/etc/passwd`. `path.resolve('/tmp/test-repo', 'link')` returns `/tmp/test-repo/link` which passes the boundary check — but the file actually served is `/etc/passwd`.

**Why it happens:** `path.resolve()` only resolves `.` and `..` segments; it does not follow symlinks.

**How to avoid:** Call `fs.realpath()` on BOTH the base and the target path. `fs.realpath()` follows all symlinks to get the true canonical path.

**Warning signs:** Create a symlink inside the registered directory pointing outside it, request it — if it returns content, the check is symlink-vulnerable.

### Pitfall 4: CSP breaks future phases if too restrictive now

**What goes wrong:** Setting `script-src 'none'` in Phase 1 is correct for Phase 1 (no client JS exists). If the CSP value is hardcoded, Phase 4 (adding the vanilla JS frontend) will silently break because the browser will block `<script src="/public/app.js">`.

**Why it happens:** CSP is set once and forgotten; the value is not updated when client-side JS is added.

**How to avoid:** Define the CSP value as a constant in a config location that can be updated in Phase 4. In Phase 1, `script-src 'none'` is correct; document that Phase 4 changes it to `script-src 'self'`.

### Pitfall 5: EADDRINUSE swallowed by async catch-all

**What goes wrong:** A generic `.catch(err => { console.error(err); process.exit(1) })` logs the full Node.js error object rather than the human-readable message.

**Why it happens:** EADDRINUSE arrives as an error with `code: 'EADDRINUSE'` — it must be specifically detected and formatted.

**How to avoid:** Check `err.code === 'EADDRINUSE'` explicitly before the generic handler.

---

## Code Examples

### Complete file serving route with path protection

```javascript
// src/server.js
const path = require('node:path');
const fs = require('node:fs/promises');
const mimeTypes = require('mime-types');

function createServer(registeredRoot) {
  const fastify = require('fastify')({ logger: false });

  // SERV-08: CSP header on all responses
  // SERV-04: Cache-Control: no-store on all responses
  fastify.addHook('preHandler', (request, reply, done) => {
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none'");
    reply.header('Cache-Control', 'no-store');
    done();
  });

  // SERV-07: Path traversal protection
  fastify.get('/file', async (request, reply) => {
    const requestedPath = request.query.path;
    if (!requestedPath) {
      return reply.status(400).send({
        error: 'Missing required query parameter: path',
        status: 400,
        requested: null,
        allowed: [registeredRoot]
      });
    }

    let realBase, realTarget;
    try {
      realBase = await fs.realpath(path.resolve(registeredRoot));
      realTarget = await fs.realpath(path.resolve(registeredRoot, requestedPath));
    } catch (err) {
      return reply.status(403).send({
        error: 'Path not found or outside registered source root',
        status: 403,
        requested: requestedPath,
        allowed: [registeredRoot]
      });
    }

    if (!realTarget.startsWith(realBase + path.sep)) {
      return reply.status(403).send({
        error: 'Path is outside the registered source root',
        status: 403,
        requested: requestedPath,
        allowed: [registeredRoot]
      });
    }

    const content = await fs.readFile(realTarget, 'utf8');
    const contentType = mimeTypes.contentType(path.extname(realTarget)) || 'text/plain';
    reply.header('Content-Type', contentType);
    return reply.send(content);
  });

  return fastify;
}

async function start(port, registeredRoot, options = {}) {
  const fastify = createServer(registeredRoot);
  // SERV-06: Bind to 127.0.0.1 explicitly
  await fastify.listen({ port, host: '127.0.0.1' });
  process.stdout.write(`gsd-browser serving ${registeredRoot} at http://127.0.0.1:${port}\n`);

  if (options.open) {
    // open is ESM-only — dynamic import required from CJS
    const { default: open } = await import('open');
    await open(`http://127.0.0.1:${port}`);
  }

  // Graceful shutdown on SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    await fastify.close();
    process.exit(0);
  });
}

module.exports = { start };
```

### Test: verify 403 on path traversal

```javascript
// test/server.test.js (Node.js built-in test runner)
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('returns 403 for path traversal', async (t) => {
  const { start } = require('../src/server.js');
  // start on port 0 to get a random free port
  // ... setup and teardown pattern
});
```

---

## Discretionary Decisions (Research Recommendations)

### Default port: 4242

Port 3000 collides with Rails, React dev servers, and dozens of other tools. Port 5000 collides with macOS AirPlay Receiver and Flask defaults. Port 4242 is:
- Memorable (repeated digit)
- Not used by any widely-deployed default service
- Above the well-known port range (1024)
- Below the typical ephemeral port range (32768+)

Confidence: MEDIUM (based on common-port surveys; no authoritative collision database exists)

### Markdown files in Phase 1: serve as raw text

Phase 1 does not include a renderer (that's Phase 2). When a `.md` file is requested in Phase 1, serve it with `Content-Type: text/plain` — readable in the browser, correct MIME type, no false rendering impression. The planner should document this as a known limitation of Phase 1.

Confidence: HIGH (follows phase boundary defined in CONTEXT.md)

### Directory listing: minimal JSON listing

When a directory path is requested, return a JSON array of filenames: `{ type: "directory", path: "/rel/path", entries: ["file.md", "subfolder/"] }`. No HTML rendering. This is sufficient for Phase 1 and provides a foundation for the tree API in Phase 4.

Confidence: MEDIUM (pragmatic choice; Phase 4 replaces this with a full tree endpoint)

### Graceful shutdown: SIGINT handler on the process

Register `process.on('SIGINT', ...)` to call `fastify.close()` before exiting. This ensures the port is released cleanly, which matters when developers Ctrl+C and immediately restart. No need for SIGTERM handling in Phase 1 (relevant for containerized deployments, deferred).

Confidence: HIGH (standard Node.js server shutdown pattern)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `listen(port)` with no host (binds 0.0.0.0) | `listen({ port, host: '127.0.0.1' })` | Security best practice; enforced since Fastify v3+ | Prevents LAN exposure of local dev tool |
| `path.normalize()` for traversal protection | `path.resolve()` + `fs.realpath()` + `startsWith` | CVE-2023-26111 and others; documented in Node.js security guides | Prevents symlink and Windows device name bypasses |
| Express.js for local dev tools | Fastify v5 (or stay with Express 4 for simplicity) | Fastify v5 GA October 2024 | Fastify is faster, but for Phase 1 the main benefit is the typed plugin API and hook system |
| `res.setHeader()` one-by-one in each route | `addHook('preHandler', ...)` for global headers | Fastify v1+ hook system | Ensures headers are never missed on any route |
| No CSP for "local only" tools | CSP as standard practice even for localhost tools | AI-agent tooling context; markdown XSS CVEs 2024-2025 | Blocks entire XSS attack class at no cost |

**Deprecated/outdated:**
- `path.normalize()` alone: documented as insufficient in Node.js path traversal guides; do not use for security checks
- `http.createServer().listen(port)` without host: creates 0.0.0.0 binding — never use without explicit host

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no install required) |
| Config file | None — use package.json `"test"` script |
| Quick run command | `node --test test/server.test.js` |
| Full suite command | `node --test test/` |

**Rationale for `node:test`:** Node.js >= 20 includes a built-in test runner (`node:test` + `node:assert/strict`). This project targets Node.js >= 20 (required by Fastify v5). Using `node:test` adds zero dependencies and aligns with the project's minimal-dependency philosophy. No Jest, no Mocha, no Vitest needed for Phase 1.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-04 | `Cache-Control: no-store` present on file responses | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-05 | Server starts on `--port 3001`; prints correct URL | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-05 | EADDRINUSE exits with code 1 and human-readable message | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-06 | Server bound to 127.0.0.1 (verify via `address()`) | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-07 | `GET /file?path=../../../etc/passwd` returns 403 | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-07 | `GET /file?path=` with symlink outside root returns 403 | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-07 | `GET /file?path=` for valid path within root returns 200 | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-08 | `Content-Security-Policy` header present on all responses | integration | `node --test test/server.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test test/server.test.js`
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/server.test.js` — covers SERV-04, SERV-05, SERV-06, SERV-07, SERV-08
- [ ] `test/filesystem.test.js` — covers path traversal unit tests for `isPathAllowed()`

*(No framework install needed — `node:test` is built into Node.js >= 20)*

---

## Open Questions

1. **CSP value for `--open` flag in Phase 1**
   - What we know: Phase 1 has `script-src 'none'`. The `--open` flag opens a browser. The browser will show the raw server response (text/plain or JSON) with no JS needed.
   - What's unclear: Does the planner need to explicitly note in the task that `script-src 'self'` will be needed in Phase 4?
   - Recommendation: Yes — add a TODO comment in `server.js` noting the Phase 4 CSP change. The planner should include this as a task acceptance criterion.

2. **`realTarget === realBase` edge case**
   - What we know: `realTarget.startsWith(realBase + path.sep)` returns false when `realTarget === realBase` (the root directory itself). This may be intentional or a bug depending on whether requesting the root is valid.
   - What's unclear: Should `GET /file?path=.` (the root directory itself) return the directory listing or a 403?
   - Recommendation: Treat the root directory request as valid (the directory listing response). Add a separate check: `realTarget === realBase || realTarget.startsWith(realBase + path.sep)`.

---

## Sources

### Primary (HIGH confidence)

- [Fastify Server Reference — official docs](https://fastify.dev/docs/latest/Reference/Server/) — `listen()` options, host parameter behavior
- [Fastify Reply Reference v5.0.x](https://fastify.dev/docs/v5.0.x/Reference/Reply/) — `reply.header()` and `reply.headers()` API
- [Fastify Hooks Reference v5.2.x](https://fastify.dev/docs/v5.2.x/Reference/Hooks/) — `addHook('preHandler', ...)` scope and behavior
- [Fastify @fastify/static GitHub](https://github.com/fastify/fastify-static) — v8.x compatible with Fastify v5; `setHeaders` option; `reply.sendFile()`
- Project PITFALLS.md — CVE-2023-26111, CVE-2025-27210, path traversal prevention with `fs.realpath()`
- Project STACK.md — Fastify v5.8.x current, Node.js >= 20 requirement, CJS bin entry pattern
- Project ARCHITECTURE.md — `path.resolve()` + `path.sep` boundary check pattern, anti-pattern documentation

### Secondary (MEDIUM confidence)

- [Complete Guide to Security Headers in Fastify (DEV Community, 2024)](https://dev.to/lcnunes09/complete-guide-to-security-headers-in-fastify-build-a-secure-by-default-api-2024-2aja) — header patterns with hooks; verified against official docs
- [Use Fastify hooks to set headers on every response — Simon Plenderleith](https://simonplend.com/use-fastify-hooks-to-set-headers-on-every-response/) — `preHandler` vs `onSend` for headers; aligns with official docs
- [Node.js EADDRINUSE handling — endyourif.com](https://www.endyourif.com/node-js-server-errors-how-to-handle-eaddrinuse/) — `err.code === 'EADDRINUSE'` catch pattern

### Tertiary (LOW confidence)

- Common-port surveys for default port selection — no single authoritative source; 4242 recommendation is based on absence of collision reports, not positive confirmation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Fastify v5 APIs verified against official docs; npm packages current as of 2026-03
- Architecture: HIGH — patterns drawn from official Fastify docs and verified against existing project ARCHITECTURE.md and PITFALLS.md
- Pitfalls: HIGH — CVE references and `fs.realpath()` requirement verified against Node.js security documentation
- Default port (4242): MEDIUM — practical recommendation, no authoritative collision database

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (30 days — Fastify v5 is in active development but stable; APIs unlikely to change in 30 days)
