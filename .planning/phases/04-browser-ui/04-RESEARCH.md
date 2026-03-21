# Phase 4: Browser UI - Research

**Researched:** 2026-03-21
**Domain:** Vanilla JS single-page app UI — three-panel shell, file tree, hash routing, content injection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**File tree scope:**
- Show markdown files only (.md) — this is a markdown browser, other file types are noise
- Convention directories (.planning, docs) elevated at the top of the tree with distinct visual treatment (icon, badge, or color differentiation)
- Convention dirs expanded by default; other directories collapsed
- Directories that contain no .md files (at any depth) should be omitted from the tree

**Content pane behavior:**
- Deep-linkable URLs via pushState — URL reflects current source and file path (e.g., `/#/source-name/path/to/file.md`), enabling bookmarks, sharing, and refresh-to-same-file
- Back/forward browser navigation works naturally via popstate
- Smooth content swap — fetch rendered HTML fragment, replace content pane innerHTML; no loading spinner unless response takes >200ms
- Auto-render README.md when first opening the app or switching to a source (consistent with Phase 2's root behavior)
- Active file highlighted in the sidebar tree with auto-expand of parent directories to show the active file (VS Code explorer pattern)

**Source switcher:**
- Source selector lives at the top of the sidebar, above the file tree
- Dropdown shows source name + smaller path hint underneath for disambiguation
- Remember last-viewed file per source in session memory (not persisted across restarts) — switching back to a source returns to the file you were reading
- Source management stays at `/sources` as a separate page; main UI has a "Manage Sources" link in the header

**Visual design:**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | File tree sidebar shows directory structure of the active source | New `/api/sources/:name/tree` endpoint returns recursive .md-only tree; JS builds collapsible tree from JSON |
| NAV-02 | File tree is collapsible/expandable for nested directories | CSS class toggle on directory nodes; convention dirs start expanded, others collapsed |
| NAV-03 | Repo switcher (dropdown) allows jumping between registered sources | `/api/sources` already returns all sources; `<select>` in sidebar header with session memory via `Map` |
| DSGN-01 | Minimalist, developer-centric UI layout (sidebar + content pane) | CSS Grid three-panel layout (header + sidebar + content); no external UI framework needed |
| DSGN-02 | Dark default theme suitable for developer use | Reuse established palette from `index.html`/`sources.html`; no new color decisions needed |
</phase_requirements>

---

## Summary

Phase 4 replaces the current `public/index.html` homepage with a proper three-panel SPA shell. The project already has all the backend infrastructure needed: sources API at `/api/sources`, file rendering at `/render`, and a well-established dark color palette. The core work is entirely frontend — building the HTML/CSS layout and the vanilla JS app logic that ties it together.

No build tool, no framework, and no new npm dependencies are required. The approach that fits this project is vanilla JS + CSS, following the same patterns already used in `index.html` and `sources.html`. The only server-side additions needed are: (1) a new `/api/sources/:name/tree` endpoint returning a recursive .md-only directory tree, and (2) a fragment mode on `/render` that returns just the `<div class="markdown-body">` body instead of a full HTML page.

The most important design decision (hash routing vs path routing) is straightforward: use hash routing (`/#/source-name/path/to/file.md`) because it requires zero Fastify route changes and naturally degrades — the server always serves `index.html` for `/`, and the JS reads `window.location.hash` on load. Fragment mode should be a query param (`?fragment=true`) on the existing `/render` endpoint, not a new route, to minimize changes to the security layer.

**Primary recommendation:** Build this as a single `public/index.html` rewrite + one new API endpoint + renderer fragment mode. No framework, no bundler, no new dependencies.

---

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Vanilla JS (ES2020) | Browser built-in | App logic, DOM manipulation, fetch | Already used in index.html and sources.html; no framework overhead for this scope |
| CSS Grid + Flexbox | Browser built-in | Three-panel layout | Standard for app shells; simpler than any framework |
| History API (`pushState`/`popstate`) | Browser built-in | Deep-linkable URLs | Locked decision; hash-based simplest option |
| `fetch()` | Browser built-in | API calls and content loading | Already used in index.html and sources.html |
| `node:fs/promises` (server) | Node built-in | Recursive directory scan for tree endpoint | Already used throughout server.js |
| Fastify (server) | v5.8.2 (already installed) | New tree API endpoint | Already the server framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `public/styles/markdown.css` | Already present | Rendered markdown styling in content pane | Reuse as-is; link from index.html |
| `github-markdown-css` | v5.9.0 (already installed) | Source of markdown.css | Not imported directly — already copied into public/ |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla JS | React/Vue/Svelte | Framework adds bundler requirement, ESM complexity, and conflicts with CJS project convention. Overkill for a three-panel static shell. |
| Hash routing | Path-based routing | Path routing requires Fastify catch-all route that serves index.html for all non-API paths. More setup, minor benefit. Hash is simpler with no server changes. |
| `?fragment=true` param | New `/render-fragment` endpoint | Separate endpoint doubles CSP routing logic. Query param is less invasive change. |
| Full upfront tree load | Lazy tree on expand | Typical repos are small (dozens of .md files); upfront load avoids async complexity on expand. Revisit if someone registers a monorepo with 500+ .md files. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
public/
├── index.html           # REPLACE with three-panel SPA shell
├── sources.html         # Keep as-is (source management)
└── styles/
    └── markdown.css     # Keep as-is (reused in content pane)

src/
├── server.js            # Add /api/sources/:name/tree endpoint + CSP for /
├── renderer.js          # Add fragment mode to buildPage() or renderMarkdown()
├── filesystem.js        # No changes
└── sources.js           # No changes
```

### Pattern 1: CSS Grid Three-Panel Layout

**What:** A fixed header row and a body row split into sidebar + content using CSS Grid on `<body>` or a wrapper element.

**When to use:** Always — this is the target layout.

```css
/* Full-viewport three-panel shell */
body {
  display: grid;
  grid-template-rows: 44px 1fr;  /* header height + content fills rest */
  grid-template-columns: 260px 1fr;  /* sidebar width + content fills rest */
  grid-template-areas:
    "header header"
    "sidebar content";
  height: 100vh;
  overflow: hidden;
}

header   { grid-area: header; }
#sidebar { grid-area: sidebar; overflow-y: auto; }
#content { grid-area: content; overflow-y: auto; }

/* Collapsed sidebar: hide it, content spans full width */
body.sidebar-collapsed {
  grid-template-columns: 0 1fr;
}
body.sidebar-collapsed #sidebar {
  display: none;   /* or width: 0; overflow: hidden */
}
```

**Key insight:** CSS Grid body layout is the standard modern approach for app shells. No JavaScript needed to manage widths.

### Pattern 2: Hash Routing

**What:** Use `window.location.hash` to encode current state. Format: `#/source-name/path/to/file.md`.

**When to use:** Always for this phase (locked decision).

```javascript
// Parse current hash on load and on popstate
function parseHash(hash) {
  // hash is like "#/my-source/.planning/ROADMAP.md"
  const raw = hash.replace(/^#\//, '');  // strip leading "#/"
  const slashIdx = raw.indexOf('/');
  if (slashIdx === -1) {
    return { sourceName: raw || null, filePath: null };
  }
  return {
    sourceName: raw.slice(0, slashIdx),
    filePath: raw.slice(slashIdx + 1)
  };
}

// Navigate to a file — updates hash, triggers popstate
function navigateTo(sourceName, filePath) {
  const hash = '#/' + sourceName + '/' + filePath;
  history.pushState(null, '', hash);
  loadFile(sourceName, filePath);
}

// Listen for back/forward
window.addEventListener('popstate', () => {
  const { sourceName, filePath } = parseHash(window.location.hash);
  if (sourceName) loadSource(sourceName, filePath);
});

// On initial load
window.addEventListener('DOMContentLoaded', async () => {
  const { sourceName, filePath } = parseHash(window.location.hash);
  // ... boot sequence
});
```

### Pattern 3: Recursive Tree Building

**What:** The server returns a nested tree structure; JS renders it recursively into the sidebar.

**Server tree endpoint response shape:**
```json
{
  "source": { "name": "my-repo", "path": "/path/to/repo" },
  "tree": [
    { "name": ".planning", "type": "dir", "convention": true, "children": [
      { "name": "ROADMAP.md", "type": "file", "path": ".planning/ROADMAP.md" }
    ]},
    { "name": "README.md", "type": "file", "path": "README.md" },
    { "name": "docs", "type": "dir", "convention": true, "children": [...] },
    { "name": "src", "type": "dir", "convention": false, "children": [...] }
  ]
}
```

**Client tree renderer (recursive DOM builder):**
```javascript
function buildTreeNode(node, sourceName, depth) {
  const el = document.createElement('div');
  el.className = 'tree-node';
  el.style.paddingLeft = (depth * 16) + 'px';

  if (node.type === 'file') {
    const link = document.createElement('a');
    link.className = 'tree-file';
    link.textContent = node.name;
    link.dataset.path = node.path;
    link.dataset.source = sourceName;
    link.href = '#/' + sourceName + '/' + node.path;
    el.appendChild(link);
  } else {
    // Directory
    const toggle = document.createElement('button');
    toggle.className = 'tree-dir' + (node.convention ? ' tree-dir--convention' : '');
    toggle.textContent = node.name;
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';

    // Convention dirs start expanded; others collapsed
    if (!node.convention) {
      childContainer.hidden = true;
      toggle.classList.add('collapsed');
    }

    toggle.addEventListener('click', () => {
      childContainer.hidden = !childContainer.hidden;
      toggle.classList.toggle('collapsed', childContainer.hidden);
    });

    for (const child of node.children || []) {
      childContainer.appendChild(buildTreeNode(child, sourceName, depth + 1));
    }
    el.appendChild(toggle);
    el.appendChild(childContainer);
  }
  return el;
}
```

### Pattern 4: Fragment Mode on /render

**What:** `/render?path=X&fragment=true` returns just the `<div class="markdown-body">` content without HTML page boilerplate.

**Server change in renderer.js:**
```javascript
// Add fragment mode parameter to buildPage
function buildPage({ filePath, bodyHtml, fragment = false }) {
  if (fragment) {
    return bodyHtml;  // just <div class="markdown-body">...</div>
  }
  // ... existing full page HTML
}
```

**Server change in server.js `/render` route:**
```javascript
const isFragment = request.query.fragment === 'true';
const html = buildPage({ filePath: requestedPath, bodyHtml, fragment: isFragment });
const contentType = isFragment ? 'text/html; charset=utf-8' : 'text/html; charset=utf-8';
// CSP stays strict (script-src 'none') regardless — fragment content is still rendered markdown
```

**Client fetch pattern:**
```javascript
async function loadFile(sourceName, filePath) {
  const url = '/render?path=' + encodeURIComponent(filePath) + '&fragment=true';

  // Start 200ms timer for loading indicator
  let loadingTimer = setTimeout(() => showLoadingIndicator(), 200);

  try {
    const res = await fetch(url);
    clearTimeout(loadingTimer);
    hideLoadingIndicator();

    if (!res.ok) {
      contentPane.innerHTML = '<div class="error-state">Failed to load file (HTTP ' + res.status + ')</div>';
      return;
    }
    const html = await res.text();
    contentPane.innerHTML = html;
    contentPane.scrollTop = 0;
  } catch (err) {
    clearTimeout(loadingTimer);
    contentPane.innerHTML = '<div class="error-state">Network error: ' + escapeHtml(err.message) + '</div>';
  }
}
```

### Pattern 5: Active File Highlighting + Auto-Expand

**What:** When loading a file, highlight it in the tree and expand all ancestor directories (VS Code explorer pattern).

```javascript
function setActiveFile(filePath) {
  // Remove previous active state
  document.querySelectorAll('.tree-file.active').forEach(el => el.classList.remove('active'));

  // Find and activate the matching tree link
  const target = document.querySelector(`.tree-file[data-path="${CSS.escape(filePath)}"]`);
  if (!target) return;

  target.classList.add('active');

  // Auto-expand all ancestor directories
  let parent = target.parentElement;
  while (parent) {
    if (parent.classList.contains('tree-children')) {
      parent.hidden = false;
    }
    if (parent.classList.contains('tree-node')) {
      const toggle = parent.querySelector(':scope > .tree-dir');
      if (toggle) toggle.classList.remove('collapsed');
    }
    parent = parent.parentElement;
  }

  // Scroll into view
  target.scrollIntoView({ block: 'nearest' });
}
```

### Pattern 6: Session Memory for Last-Viewed File Per Source

**What:** `Map<sourceName, filePath>` stored in JS closure. No localStorage, no persistence.

```javascript
const lastViewedFile = new Map();  // session memory only

function switchSource(sourceName) {
  currentSource = sourceName;
  loadTree(sourceName).then(() => {
    const lastFile = lastViewedFile.get(sourceName) || 'README.md';
    loadFile(sourceName, lastFile);
  });
}

function onFileClick(sourceName, filePath) {
  lastViewedFile.set(sourceName, filePath);
  navigateTo(sourceName, filePath);
}
```

### Pattern 7: New Tree API Endpoint (Server)

**What:** `/api/sources/:name/tree` recursively scans the source directory, returns only .md files (omitting directories with no .md files anywhere in their subtree), elevates convention directories.

```javascript
// In server.js — async recursive scan
async function buildTree(dirPath, rootPath, conventions) {
  const CONVENTION_DIRS = new Set(['.planning', 'docs']);

  async function scan(absDir, relDir) {
    let entries;
    try { entries = await fs.readdir(absDir); } catch { return []; }

    const nodes = [];
    for (const entry of entries) {
      const absEntry = path.join(absDir, entry);
      const relEntry = relDir ? relDir + '/' + entry : entry;
      let stat;
      try { stat = await fs.stat(absEntry); } catch { continue; }

      if (stat.isDirectory()) {
        const children = await scan(absEntry, relEntry);
        // Omit directories with no .md files at any depth
        if (children.length === 0) continue;
        nodes.push({
          name: entry,
          type: 'dir',
          convention: CONVENTION_DIRS.has(entry),
          children
        });
      } else if (entry.endsWith('.md')) {
        nodes.push({ name: entry, type: 'file', path: relEntry });
      }
    }

    // Sort: convention dirs first, then alpha
    return nodes.sort((a, b) => {
      if (a.type === 'dir' && b.type === 'dir') {
        if (a.convention && !b.convention) return -1;
        if (!a.convention && b.convention) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return scan(dirPath, '');
}
```

### Anti-Patterns to Avoid

- **`innerHTML` for user-controlled content without escaping:** The file path in breadcrumbs and tree labels is user-controlled (via file system names). Always use `textContent` for labels, or `escapeHtml()` before `innerHTML`.
- **Modifying renderer.js global state during fragment requests:** `renderMarkdown()` modifies `md.renderer.rules.fence` per-call. This is safe for sequential requests but would race under concurrent load. For this phase (single-user localhost), it's acceptable — don't refactor the renderer for concurrency in Phase 4.
- **Serving the app shell page under strict CSP:** The `GET /` route already uses `MANAGEMENT_CSP` (which allows `script-src 'self' 'unsafe-inline'`). The comment in server.js says to upgrade from `'none'` to `'self'` — but `MANAGEMENT_CSP` is already applied to `/`. The Phase 4 JS will work without any CSP changes as long as the script lives in `index.html` (inline) or in a `.js` file in `public/`.
- **Putting frontend JS in `public/` as a `.js` file under strict CSP:** `CSP_HEADER` has `script-src 'none'`. The `GET /` route overrides to `MANAGEMENT_CSP`. So a `public/app.js` file fetched by the SPA shell will be allowed. However, the existing pattern is inline `<script>` in `.html` files — follow that pattern for consistency.
- **Using `@fastify/static` to serve `index.html` at `/`:** There is an explicit `GET /` route in server.js that reads and serves `index.html`. Static will serve it at `GET /index.html`. The explicit route takes precedence for `GET /` and applies `MANAGEMENT_CSP`. Don't remove or bypass the explicit `/` route.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive directory traversal with filtering | Custom traversal with complex edge cases | `fs.readdir` + `fs.stat` in a simple recursive async function | The pattern is ~30 lines and well understood; no library adds value here |
| Markdown rendering | Custom renderer | Existing `renderMarkdown()` via `/render?fragment=true` | Already implemented, tested, handles Mermaid + Shiki + GFM |
| URL state management | Custom pushState wrapper | Direct `history.pushState` + `window.location.hash` | Simpler than any router library; hash routing is 20 lines |
| CSS layout | JS-calculated widths | CSS Grid `grid-template-areas` | Grid is the right tool; JS layout is fragile and slow |
| Source listing | Re-implement `/api/sources` | Existing endpoint | Already returns `available`, `name`, `path`, `conventions` |

**Key insight:** This phase is a frontend build. The server infrastructure is complete. Don't let frontend complexity creep — the entire app.js should be under 300 lines.

---

## Common Pitfalls

### Pitfall 1: CSP Blocks Inline Scripts

**What goes wrong:** Adding `<script>` to `index.html` causes the browser to block execution because `CSP_HEADER` (`script-src 'none'`) is set globally and may accidentally get applied to `/`.

**Why it happens:** The `preHandler` hook sets `CSP_HEADER` on every response. The `GET /` route's `onSend` hook then overrides to `MANAGEMENT_CSP`. If the `onSend` hook is removed or skipped, the strict CSP blocks all scripts.

**How to avoid:** Keep the `onSend` hook on the `GET /` route that overrides to `MANAGEMENT_CSP`. Verify with: `curl -I http://localhost:PORT/ | grep content-security-policy` — should show `unsafe-inline`.

**Warning signs:** Browser console shows "Refused to execute inline script because it violates Content-Security-Policy".

### Pitfall 2: Fragment Content Gets Strict CSP But Needs `script-src 'none'`

**What goes wrong:** Developer accidentally relaxes CSP for `/render?fragment=true` thinking the fragment needs scripts (it doesn't — it's static HTML).

**Why it happens:** The fragment is injected into the content pane of the SPA. The fragment itself is rendered markdown HTML — it should never execute scripts. The strict `CSP_HEADER` on `/render` is correct and intentional.

**How to avoid:** Never change the CSP for `/render`. Fragment mode only changes the HTML wrapper, not the security headers.

### Pitfall 3: Hash vs pushState Confusion

**What goes wrong:** Using `history.pushState` with path-based URLs (e.g., `/browse/source/file.md`) returns 404 on refresh because Fastify has no catch-all route.

**Why it happens:** Path-based routing requires the server to return `index.html` for any non-API route. Hash-based routing avoids this entirely.

**How to avoid:** Use hash routing: `#/source-name/path/to/file.md`. The hash is never sent to the server. `pushState` with hash URLs still enables browser history navigation via `popstate`.

**Note on pushState with hashes:** `history.pushState(null, '', '#/' + ...)` correctly updates the URL bar and history stack. Both `pushState` and `popstate` work with hash-based URLs.

### Pitfall 4: Tree Node `data-path` Collision Between Sources

**What goes wrong:** Two sources each have a `README.md`. The `data-path="README.md"` selector matches both. Highlighting and navigation break.

**Why it happens:** The active file selector `[data-path="README.md"]` is not scoped to the current source.

**How to avoid:** Either scope the tree DOM to the current source (only one source tree visible at a time, cleared and rebuilt on source switch), or include `data-source` on every file node and scope selectors accordingly.

**Recommended approach:** Rebuild the entire `#tree` container whenever the source switches. This is simpler than maintaining multiple trees and keeping them in sync.

### Pitfall 5: `innerHTML` with File Paths in Breadcrumbs

**What goes wrong:** A file named `<script>alert(1)</script>.md` would execute if set via `innerHTML`.

**Why it happens:** Path comes from the filesystem (user-registered source). An adversarial or accidental filename could contain HTML.

**How to avoid:** Use `textContent` for all file names and path components, or pass through `escapeHtml()` before any `innerHTML` insertion. The `escapeHtml()` function already exists in `index.html` and `sources.html` — copy it to `app.js`.

### Pitfall 6: Recursive Tree Scan Performance on Large Repos

**What goes wrong:** A registered source with thousands of files causes the `/api/sources/:name/tree` endpoint to take seconds.

**Why it happens:** Synchronous `readdir` + `stat` in a tight loop doesn't scale. With `.md`-only filtering and directory pruning the risk is low for typical repos, but a monorepo could still be slow.

**How to avoid:** The recursive scan omits entire directory subtrees with no `.md` files (depth-first pruning). For a typical developer repo with ~50 `.md` files, this is fast. If a source has a huge `node_modules/` with no `.md` files, the first `readdir` of `node_modules/` is needed but the subtree is pruned immediately.

**Warning signs:** `/api/sources/:name/tree` takes >500ms. Mitigation: add a `.md` file count heuristic or set a max depth limit (e.g., 10 levels).

### Pitfall 7: Missing README.md on Source Switch

**What goes wrong:** User switches to a source with no `README.md`. The app tries to load it and gets 404. Content pane shows an error.

**Why it happens:** The locked decision says "auto-render README.md when switching to a source." If the source has no README.md, this fails.

**How to avoid (Claude's Discretion):** Check if the tree has a `README.md` node before attempting to load it. If not present, load the first `.md` file in the tree (BFS order — first file encountered). If the tree has no files at all, show an "empty source" hint: `<div class="empty-state">No markdown files found in this source.</div>`.

---

## Code Examples

Verified patterns from existing project code:

### Existing escapeHtml (copy to app logic)
```javascript
// Source: public/index.html (already established pattern)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Existing API fetch pattern
```javascript
// Source: public/index.html (established fetch pattern)
const res = await fetch('/api/sources');
if (!res.ok) throw new Error('HTTP ' + res.status);
const data = await res.json();
const sources = (data.sources || []).filter(s => s.available);
```

### Existing source path hint in dropdown

The CONTEXT.md calls for a dropdown showing "source name + smaller path hint underneath." A `<select>` element cannot hold multi-line `<option>` elements in standard HTML. Use a custom dropdown (div-based) or a `<select>` with the path in parentheses: `my-repo (/Users/me/repos/my-repo)`. The simpler `<select>` approach is recommended for Phase 4 — Phase 4.5 can upgrade to a custom component.

```javascript
// Simple select-based source switcher
function buildSourceSelect(sources, activeName) {
  const select = document.createElement('select');
  select.id = 'source-select';
  for (const src of sources) {
    const opt = document.createElement('option');
    opt.value = src.name;
    opt.textContent = src.name + '  (' + src.path + ')';
    opt.selected = src.name === activeName;
    select.appendChild(opt);
  }
  return select;
}
```

### Fragment mode client call
```javascript
// Fetch rendered HTML fragment for content pane injection
async function fetchFragment(filePath) {
  const url = '/render?path=' + encodeURIComponent(filePath) + '&fragment=true';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();  // returns <div class="markdown-body">...</div>
}
```

### CSS Grid app shell (full pattern)
```css
/* Source: Architecture Pattern 1 (this research) */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body { height: 100%; overflow: hidden; }

body {
  display: grid;
  grid-template-rows: 44px 1fr;
  grid-template-columns: 260px 1fr;
  grid-template-areas: "header header" "sidebar content";
  background: #0d1117;
  color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 14px;
}

#app-header { grid-area: header; background: #161b22; border-bottom: 1px solid #21262d; }
#sidebar    { grid-area: sidebar; background: #161b22; border-right: 1px solid #21262d; overflow-y: auto; }
#content    { grid-area: content; background: #0d1117; overflow-y: auto; }

body.sidebar-hidden {
  grid-template-columns: 0 1fr;
}
body.sidebar-hidden #sidebar { display: none; }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-page navigation (full page load per file) | SPA with `innerHTML` injection + hash routing | Phase 4 | Seamless navigation without full reload |
| Static index.html (current) | Dynamic SPA shell (Phase 4) | Phase 4 | index.html is completely rewritten |
| `/render` returns full HTML page | `/render?fragment=true` returns body only | Phase 4 | Enables content pane injection without `<iframe>` |
| `script-src 'none'` on `/` | `MANAGEMENT_CSP` already on `/` | Phase 3 Plan 03 (already done) | No CSP changes needed for Phase 4 |

**Already in place (no changes needed):**
- `MANAGEMENT_CSP` on `GET /` — scripts are already allowed on the homepage
- `/api/sources` — already returns `name`, `path`, `available`, `conventions`
- `/render` — already renders markdown; just needs fragment param
- `public/styles/markdown.css` — content pane can `<link>` directly

---

## Open Questions

1. **How deep to scan for the tree endpoint**
   - What we know: typical repos have `.planning/`, `docs/`, and scattered `.md` files. The recursive scan with `.md`-only filtering handles this well.
   - What's unclear: if someone registers a monorepo or a large project as a source, the scan could be slow.
   - Recommendation: add a `maxDepth` limit of 10 and a total `.md` file cap of 500 to the tree scanner. Return a `truncated: true` flag in the response if hit.

2. **`<select>` vs custom dropdown for source switcher**
   - What we know: `<select>` cannot show multi-line options. The CONTEXT.md asks for "source name + smaller path hint underneath."
   - What's unclear: how important is the two-line visual treatment vs shipping quickly.
   - Recommendation: ship with `<select>` showing `name (path)` in parentheses. The path is useful for disambiguation and fits in a single line. A custom dropdown can be a Phase 5 polish item.

3. **README.md fallback when not present**
   - What we know: the locked decision says "auto-render README.md when switching to a source."
   - What's unclear: what to show when the source has no README.md.
   - Recommendation (Claude's Discretion): show first `.md` file in tree (BFS order). If tree is empty, show `<div class="empty-state">No markdown files found.</div>`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, no install needed) |
| Config file | none — `node --test test/` in package.json scripts |
| Quick run command | `node --test test/server.test.js` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | `/api/sources/:name/tree` returns recursive .md-only tree JSON | unit | `node --test test/server.test.js` | ❌ Wave 0 |
| NAV-01 | Tree omits directories with no .md files | unit | `node --test test/server.test.js` | ❌ Wave 0 |
| NAV-02 | Tree response includes `type: "dir"` nodes with `children` | unit | `node --test test/server.test.js` | ❌ Wave 0 |
| NAV-02 | Convention dirs have `convention: true` flag | unit | `node --test test/server.test.js` | ❌ Wave 0 |
| NAV-03 | Source switcher loads sources from `/api/sources` (existing endpoint) | smoke | `node --test test/e2e-smoke.test.js` | ✅ existing |
| DSGN-01 | `GET /` returns HTML with `id="sidebar"` and `id="content"` elements | smoke | `node --test test/server.test.js` | ❌ Wave 0 |
| DSGN-02 | `GET /` response body contains dark theme color (e.g., `#0d1117`) | smoke | `node --test test/server.test.js` | ❌ Wave 0 |
| NAV-01/03 | Fragment mode: `GET /render?path=X&fragment=true` returns body without `<!DOCTYPE html>` | unit | `node --test test/server.test.js` | ❌ Wave 0 |

**Note:** DSGN-01 and DSGN-02 are primarily visual requirements. Server-side tests can verify the HTML structure is present; visual correctness requires manual browser verification.

### Sampling Rate

- **Per task commit:** `node --test test/server.test.js`
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/server.test.js` — Add tests for new `/api/sources/:name/tree` endpoint (NAV-01, NAV-02)
- [ ] `test/server.test.js` — Add test for `/render?fragment=true` mode (NAV-01 integration)
- [ ] `test/server.test.js` — Add tests for `GET /` structure (DSGN-01, DSGN-02 partial)
- [ ] No new test files needed — add to existing `test/server.test.js`

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/server.js`, `src/renderer.js`, `public/index.html`, `public/sources.html`, `test/server.test.js`, `package.json` — all existing patterns verified in-source
- MDN Web Docs (browser built-ins) — `history.pushState`, `popstate`, CSS Grid, `fetch()` — standard and stable APIs
- `04-CONTEXT.md` — locked user decisions and existing code insights

### Secondary (MEDIUM confidence)

- CSS Grid browser compatibility — universally supported in all modern browsers; no compatibility concerns for a localhost developer tool
- `node:fs/promises` recursive `readdir` + `stat` pattern — standard Node.js approach, no library needed

### Tertiary (LOW confidence)

- None — all research areas covered by codebase inspection and stable browser APIs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools already in codebase
- Architecture: HIGH — patterns verified against existing code; hash routing and CSS Grid are stable standards
- Pitfalls: HIGH — identified from existing code patterns (CSP hooks, path handling, escapeHtml usage)
- Server tree endpoint: HIGH — follows established Fastify route pattern; recursive fs scan is simple

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable — vanilla JS, CSS, and Node.js built-ins do not change)
