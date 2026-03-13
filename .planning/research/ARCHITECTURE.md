# Architecture Research

**Domain:** Local markdown server with multi-source registration and file tree navigation
**Researched:** 2026-03-13
**Confidence:** HIGH (core patterns well-established; multi-source registration is novel but builds on clear primitives)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  bin/gsd-browser.js  — parse args, bootstrap server  │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                     HTTP Server Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Route: GET / │  │ Route: /file │  │ Route: /api/ │       │
│  │  (UI shell)  │  │  (markdown)  │  │  (sources)   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
├─────────┼─────────────────┼──────────────────┼──────────────┤
│         │           Service Layer             │               │
│  ┌──────┴──────┐  ┌───────┴───────┐  ┌───────┴──────┐       │
│  │  Renderer   │  │  FileSystem   │  │  SourceStore  │       │
│  │  (markdown  │  │  Service      │  │  (register/  │       │
│  │   → HTML)   │  │  (tree, read) │  │   list/rm)   │       │
│  └─────────────┘  └───────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                       Data Layer                             │
│  ┌─────────────────┐  ┌────────────────────────────────┐    │
│  │  Disk (live     │  │  ~/.config/gsd-browser/        │    │
│  │  markdown files)│  │  sources.json (registered repos│    │
│  └─────────────────┘  └────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Entry (`bin/`) | Parse argv, validate args, start server, handle signals | `commander` or `yargs`, `#!/usr/bin/env node` |
| HTTP Server | Route requests, serve static assets, coordinate handlers | Express 5 or Fastify; minimal middleware |
| Renderer | Convert markdown string to HTML; apply syntax highlighting | `markdown-it` + `highlight.js` or `shiki` |
| FileSystem Service | Read file from disk, walk directory tree, discover conventions | Node `fs/promises`, path normalization |
| SourceStore | Persist/load registered sources; CRUD for repos/paths | `conf` or `configstore`; JSON at `~/.config/gsd-browser/` |
| Frontend Shell | Single-page HTML shell with file tree sidebar + content pane | Vanilla JS + CSS variables; no build step required |
| Theme Engine | Switch CSS variable sets at runtime; persist selection | `localStorage` + CSS custom property swaps |

## Recommended Project Structure

```
gsd-browser/
├── bin/
│   └── gsd-browser.js      # CLI entry; #!/usr/bin/env node; starts server
├── src/
│   ├── server.js            # HTTP server setup, route registration
│   ├── renderer.js          # markdown-it instance, plugin config, HTML output
│   ├── filesystem.js        # readFile, buildTree, discoverConventions
│   ├── sources.js           # SourceStore: load/save/add/remove from conf
│   └── routes/
│       ├── ui.js            # GET / → HTML shell with inlined or linked assets
│       ├── file.js          # GET /file?path=... → rendered HTML fragment
│       ├── tree.js          # GET /tree?source=... → JSON directory tree
│       └── api.js           # POST/DELETE /api/sources → source registration
├── public/
│   ├── app.js               # Vanilla JS: tree rendering, fetch, navigation
│   ├── themes/
│   │   ├── catppuccin-mocha.css
│   │   ├── catppuccin-latte.css
│   │   └── dracula.css
│   └── base.css             # Layout, typography, structural styles
├── package.json             # "bin": { "gsd-browser": "./bin/gsd-browser.js" }
└── test/
    ├── renderer.test.js
    ├── filesystem.test.js
    └── sources.test.js
```

### Structure Rationale

- **`bin/`:** Thin entry point — one job (parse args, call `server.start()`). Keeps testable logic out of the CLI boundary.
- **`src/`:** All server logic. Flat enough to navigate but split by concern. Routes stay thin; services do the work.
- **`public/`:** Static assets served directly. Vanilla JS chosen to eliminate build tooling from the distribution path.
- **`themes/`:** One CSS file per theme. Adding a theme = adding one file, no code change.
- **No `dist/` folder:** Node.js CJS runs directly; no transpilation needed for the target environment.

## Architectural Patterns

### Pattern 1: Render-on-Request (No Content Cache)

**What:** Every HTTP request for a markdown file triggers a fresh `fs.readFile()` and a fresh `markdown-it` render. Nothing is cached.

**When to use:** Always, for this tool. The entire value proposition is showing the file as it exists right now — agents may be writing it concurrently.

**Trade-offs:** Slightly higher per-request latency (~1-5ms for typical planning files). Eliminated complexity of cache invalidation. For a local tool serving single-user traffic this is the correct choice.

**Example:**
```javascript
// src/routes/file.js
async function fileHandler(req, res) {
  const filePath = req.query.path; // absolute path, validated
  const raw = await fs.readFile(filePath, 'utf8');
  const html = renderer.render(raw);
  res.json({ html, path: filePath });
}
```

### Pattern 2: Source Registry as Persistent Store

**What:** Registered repos/paths live in a JSON file at `~/.config/gsd-browser/sources.json` (via `conf` package). The server reads from this store at startup and on each API call — never holds an in-memory-only copy.

**When to use:** Any tool with user-level configuration that must survive restarts and work across `npx` invocations (which start fresh processes).

**Trade-offs:** Adds a dependency (`conf`). Eliminates the "I registered this repo but it's gone after restart" bug. Cross-platform path handling comes for free.

**Example:**
```javascript
// src/sources.js
const Conf = require('conf');
const store = new Conf({ projectName: 'gsd-browser' });

function addSource(label, absPath) {
  const sources = store.get('sources', []);
  sources.push({ label, path: absPath, addedAt: Date.now() });
  store.set('sources', sources);
}

function listSources() {
  return store.get('sources', []);
}
```

### Pattern 3: Convention-Based Discovery with Explicit Override

**What:** When a repo is registered, the FileSystem Service automatically discovers `.planning/`, `docs/`, and `README.md`. These become the default "entry points" for the source. Users can also register arbitrary explicit paths.

**When to use:** Any tool where the common case should work with zero configuration, but edge cases must be supported.

**Trade-offs:** Conventions must be documented. Discovery logic needs to be resilient when conventional directories don't exist (skip silently, don't error).

**Example:**
```javascript
// src/filesystem.js
const CONVENTIONS = ['.planning', 'docs', 'README.md'];

async function discoverConventions(repoRoot) {
  const found = [];
  for (const candidate of CONVENTIONS) {
    const full = path.join(repoRoot, candidate);
    if (await exists(full)) found.push(full);
  }
  return found;
}
```

### Pattern 4: CSS Variable Theme Switching

**What:** Each theme is a CSS file that defines the same set of custom property names (`--color-bg`, `--color-text`, etc.) with different values. The active theme is a `<link>` tag whose `href` is swapped by JavaScript. Selection is persisted to `localStorage`.

**When to use:** Any developer tool needing multiple terminal-palette themes without a build step.

**Trade-offs:** Requires discipline in using only the defined variables (no hardcoded colors in `base.css`). Theme add/remove is trivial. No JavaScript color computation needed.

**Example:**
```javascript
// public/app.js
function applyTheme(name) {
  document.getElementById('theme-link').href = `/public/themes/${name}.css`;
  localStorage.setItem('gsd-theme', name);
}
```

## Data Flow

### Request Flow: View a Markdown File

```
User clicks file in tree sidebar
    ↓
app.js: fetch('/file?path=/abs/path/to/file.md')
    ↓
routes/file.js: validate path is within a registered source
    ↓
filesystem.js: fs.readFile(path, 'utf8')
    ↓
renderer.js: markdownIt.render(rawContent) → HTML string
    ↓
Response: { html: '<article>...</article>', path: '...' }
    ↓
app.js: inject html into #content-pane, update browser URL hash
```

### Request Flow: Navigate the File Tree

```
User selects a source from repo switcher
    ↓
app.js: fetch('/tree?source=my-repo')
    ↓
routes/tree.js: look up source path from SourceStore
    ↓
filesystem.js: walk directory recursively, filter *.md and dirs
    ↓
Response: JSON tree structure { name, path, type, children[] }
    ↓
app.js: render tree nodes into sidebar DOM
```

### Request Flow: Register a New Source

```
User runs: gsd-browser add /path/to/repo
    ↓
bin/gsd-browser.js: parse 'add' subcommand
    ↓
sources.js: validate path exists, check for duplicates
    ↓
filesystem.js: discoverConventions(repoRoot)
    ↓
sources.js: store.set({ label, path, conventions, addedAt })
    ↓
Console: "Registered: my-repo at /path/to/repo"
```

### State Management

```
Persistent State (conf / JSON file):
  sources[]  ← add/remove via CLI subcommands or API

Session State (browser localStorage):
  activeTheme  ← set by theme switcher
  lastSource   ← optional, restore last viewed repo on open

Runtime State (in-memory, no persistence needed):
  none — server is stateless between requests
```

### Key Data Flows

1. **Source registration:** CLI → `sources.js` → `~/.config/gsd-browser/sources.json` → persisted across restarts
2. **File rendering:** HTTP request → `filesystem.js` (read from disk) → `renderer.js` (markdown → HTML) → HTTP response — no shared state, fully pure
3. **Tree navigation:** HTTP request → `sources.js` (resolve source path) → `filesystem.js` (walk tree) → JSON response → browser DOM update
4. **Theme change:** Browser UI → `localStorage` write → CSS `<link>` href swap — no server involvement

## Scaling Considerations

This is a single-user local developer tool. Scaling is not a design concern. The relevant operational questions are:

| Concern | Reality | Approach |
|---------|---------|----------|
| Many registered repos (50+) | Linear list lookup is fine | JSON array; add indexing if ever needed |
| Large file trees (thousands of files) | Walk is synchronous CPU work | Async walk with early abort on depth limit |
| Large markdown files (1MB+) | Render is synchronous CPU work | Acceptable; streaming not worth the complexity |
| Concurrent requests | Node.js event loop handles it; no concurrency issues | No shared mutable state means this is safe |

## Anti-Patterns

### Anti-Pattern 1: Caching Rendered Markdown

**What people do:** Cache the HTML output of `markdown-it.render()` in memory keyed by file path, invalidate on file change via `fs.watch()`.

**Why it's wrong for this tool:** The entire value of gsd-browser is showing the live state of files that agents are actively writing. Caching — even with watch-based invalidation — introduces a race window. File watching also adds complexity (race conditions, OS limits on watchers, cleanup on exit). The project explicitly excludes file watching.

**Do this instead:** Read from disk on every request. For local files under 5MB this adds under 5ms. The simplicity is worth far more than the latency savings.

### Anti-Pattern 2: Path Whitelisting via String Prefix Only

**What people do:** Validate that a requested file path "starts with" a registered source path using string comparison.

**Why it's wrong:** `path.startsWith('/home/user/repo')` allows traversal to `/home/user/repo-evil/` — a sibling directory that shares the prefix. Path normalization attacks (`../`) bypass naive prefix checks.

**Do this instead:** Normalize both paths with `path.resolve()`, then check that the normalized file path starts with `normalize(sourcePath) + path.sep`. Reject any path that doesn't resolve within a registered source.

```javascript
function isPathAllowed(filePath, sources) {
  const resolved = path.resolve(filePath);
  return sources.some(s => {
    const base = path.resolve(s.path) + path.sep;
    return resolved.startsWith(base);
  });
}
```

### Anti-Pattern 3: Embedding Frontend as a Build Artifact

**What people do:** Use React/Vue/Svelte for the file tree and content pane, add a build step (`vite build`), commit `dist/`, require build before publish.

**Why it's wrong:** This adds toolchain complexity to what must be a zero-install `npx` experience. The build artifact must be kept in sync with source. Contributes friction for contributors.

**Do this instead:** Vanilla JavaScript in `public/app.js`. DOM manipulation for a file tree + content pane is ~200 lines. The tool serves its own `public/` directory as static files — no build step, no framework.

### Anti-Pattern 4: Storing Absolute Paths from the npx Invocation

**What people do:** Use `process.cwd()` or `__dirname` at runtime to resolve relative paths and store those as the source path.

**Why it's wrong:** `npx gsd-browser` runs from whatever directory the user is in. `process.cwd()` is unstable. Stored paths must be fully resolved absolute paths at registration time.

**Do this instead:** Resolve all paths at `add` time: `const absPath = path.resolve(userInput)`. Validate the path exists before storing.

## Integration Points

### External Services

None. This is a fully local, offline tool. No external services.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI → Server | Function call (`server.start(port, options)`) | CLI is thin; passes parsed config |
| Routes → Services | Direct function calls (no event bus needed) | Keep it simple; this is not microservices |
| Routes → SourceStore | Synchronous reads (conf is sync) | No async needed for config reads |
| Routes → FileSystem | Async (`await readFile`, `await walk`) | Always async to avoid blocking event loop |
| Frontend → Server | HTTP fetch (REST-style endpoints) | JSON responses; no WebSocket needed |
| Theme Engine → Server | None | Theme switching is pure client-side |

## Build Order Implications

Based on component dependencies, build in this order:

1. **SourceStore (`sources.js`)** — No dependencies. Can be tested standalone. All other components depend on knowing what sources are registered.
2. **FileSystem Service (`filesystem.js`)** — Depends on: knowing a valid path. Independent of renderer and HTTP layer. Build and test path safety here.
3. **Renderer (`renderer.js`)** — Depends on: `markdown-it` and plugin selection. Fully independent of HTTP and file system. Test with fixture strings.
4. **HTTP Routes (`routes/`)** — Depends on: SourceStore + FileSystem + Renderer. Wire them together. This is integration territory.
5. **HTTP Server (`server.js`)** — Depends on: Routes. Thin orchestration layer.
6. **CLI Entry (`bin/`)** — Depends on: Server. Adds arg parsing and process lifecycle.
7. **Frontend Shell (`public/`)** — Can be developed in parallel with backend routes once the API contract is defined. Depends on: agreed JSON shapes from routes.
8. **Themes (`public/themes/`)** — Fully independent. Can be added at any point after the CSS variable API is defined.

## Sources

- [Markserv architecture (GitHub)](https://github.com/markserv/markserv) — multi-theme localStorage pattern, WebSocket live-reload (we skip), CSS/HTML/JS split
- [HADS architecture (GitHub)](https://github.com/sinedied/hads) — `/bin`, `/lib`, `/views`, `/public` directory convention for Node markdown servers
- [mdts architecture (GitHub)](https://github.com/unhappychoice/mdts) — three-panel layout, TypeScript, Netlify functions, glob filtering; confirms file-tree + content pane as standard pattern
- [configstore (npm)](https://www.npmjs.com/package/configstore) — `~/.config/<name>/` JSON persistence pattern for CLI tools
- [conf (npm)](https://www.npmjs.com/package/conf) — modern successor to configstore; XDG-compliant; recommended
- [markdown-it (npm)](https://www.npmjs.com/package/markdown-it) — extensible markdown renderer; plugin system; server-side HTML generation
- [Catppuccin palette (npm)](https://www.npmjs.com/package/@catppuccin/palette) — CSS variable approach to theme switching
- [Express 5 vs Fastify 2025](https://medium.com/codetodeploy/express-or-fastify-in-2025-whats-the-right-node-js-framework-for-you-6ea247141a86) — for a local single-user tool, Express 5 is simpler and sufficient; Fastify adds no meaningful benefit here

---
*Architecture research for: gsd-browser — local markdown server with multi-source registration*
*Researched: 2026-03-13*
