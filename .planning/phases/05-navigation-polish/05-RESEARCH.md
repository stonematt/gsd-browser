# Phase 5: Navigation Polish - Research

**Researched:** 2026-03-28
**Domain:** markdown-it plugins, SPA link interception, heading anchors, inline TOC
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Table of contents: Collapsible outline at the top of the rendered document in column 3 (the content pane)
- Style reference: GitHub's TOC dropdown — compact, expands on click, collapses out of the way
- TOC appears above the markdown body, not in the sidebar/navigator
- Mermaid is already working (Phase 2, REND-01) and needs no changes here

### Claude's Discretion
- Relative link interception strategy (how .md links route through the SPA fetch pipeline)
- Heading anchor implementation (hover-reveal icon, hash in URL bar, scroll behavior)
- TOC depth (h2-only vs h2-h3 vs h2-h4)
- Non-.md link handling (open externally vs ignore)
- Cross-source link behavior
- markdown-it plugin choices (markdown-it-anchor, markdown-it-toc-done-right, or custom)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-04 | Relative markdown links resolve correctly within a source | Client-side click interception on rendered `<a href="*.md">` tags; resolve relative path against current file's directory; call existing `loadFile()` or `loadPhaseFile()` SPA pipeline |
| NAV-05 | Heading anchors are auto-generated and clickable; URLs can be copied and shared | `markdown-it-anchor` v9.2.0 plugin added to `initRenderer()`; `ariaHidden` permalink style; hash pushed to URL bar via `history.pushState()` |
| NAV-06 | Inline table of contents generated per document from headings | Heading metadata collected via `markdown-it-anchor` callback; custom TOC HTML built server-side and prepended to body; collapsible via `<details>/<summary>` HTML element |
</phase_requirements>

---

## Summary

Phase 5 adds three navigation features to an existing markdown-it v14 / Fastify v5 SPA: relative link resolution (NAV-04), heading anchors (NAV-05), and an inline collapsible table of contents (NAV-06). All three work within the established server-side rendering pipeline without requiring build tooling or external runtime dependencies beyond two new markdown-it plugins.

The server already renders markdown fragments via `/render?path=...&fragment=true` and injects them into the DOM via `innerHTML`. All three features plug cleanly into this pattern. Relative link interception happens client-side as a delegated click handler on the content container. Heading anchors and TOC are generated server-side by adding `markdown-it-anchor` to `initRenderer()`. The collapsible TOC is built from heading metadata collected during render and prepended to the fragment HTML.

**Primary recommendation:** Add `markdown-it-anchor` to the markdown-it instance in `renderer.js`; use the `callback` option to collect heading metadata; build a `<details>/<summary>` TOC and prepend it to the rendered body; intercept `.md` link clicks client-side with a delegated event listener on the content pane.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| markdown-it-anchor | 9.2.0 | Adds `id` attributes to headings + permalink links | CJS-compatible, markdown-it v14 verified, `callback` option enables heading extraction for TOC; already identified in STACK.md |
| markdown-it-toc-done-right | 4.2.0 | Optional: generates TOC inline from `${toc}` placeholder | CJS-compatible; pairs with markdown-it-anchor; but NOT needed — see Architecture note |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| HTML `<details>/<summary>` | Native HTML5 | Collapsible TOC container | Zero JS required; matches GitHub TOC dropdown style; works in all modern browsers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `markdown-it-toc-done-right` (placeholder in source) | Custom TOC from callback headings | Placeholder approach requires `${toc}` in every markdown file; custom build from callback works on all documents without modifying source — prefer custom |
| `<details>/<summary>` for TOC | JS show/hide toggle | `<details>` is native HTML, zero JS, accessible; JS toggle adds code for no gain |
| Client-side delegated click handler | Server-side link rewriting | Server rewriting would require knowing the document path context at render time and complicates the `/render` endpoint; client interception is simpler and aligned with existing SPA pattern |

**Installation:**
```bash
npm install markdown-it-anchor
```
(`markdown-it-toc-done-right` is NOT needed — TOC is built from `callback` headings.)

---

## Architecture Patterns

### Recommended Project Structure
No new files/directories needed. Changes touch:
```
src/
└── renderer.js         # Add markdown-it-anchor; extend renderMarkdown() to return headings + TOC
public/
└── index.html          # Add delegated click handler for .md links; inject TOC into content pane
```

### Pattern 1: Heading Anchors via markdown-it-anchor callback

**What:** Register `markdown-it-anchor` with `ariaHidden` permalink style. Collect headings via `callback`. Return both `bodyHtml` and `headings[]` from `renderMarkdown()`.

**When to use:** Always — applies to all rendered documents.

**Example:**
```javascript
// Source: verified against markdown-it-anchor 9.2.0 in test environment
const anchor = require('markdown-it-anchor');

// In initRenderer(), after md = new MarkdownIt(...):
const headingsBuffer = [];

md.use(anchor, {
  level: [2, 3, 4],
  permalink: anchor.permalink.ariaHidden({ placement: 'before' }),
  callback: (token, info) => {
    headingsBuffer.push({
      level: parseInt(token.tag.slice(1)),
      slug: info.slug,
      title: info.title
    });
  }
});

// In renderMarkdown(), clear buffer before render, read after:
headingsBuffer.length = 0;
const bodyHtml = md.render(source);
const headings = [...headingsBuffer];
// return { bodyHtml: `<div class="markdown-body">${bodyHtml}</div>`, headings }
```

**CRITICAL:** The `headingsBuffer` must be module-level (shared with the callback closure) and cleared before each `md.render()` call, since the callback fires synchronously during render.

### Pattern 2: Collapsible TOC from Headings

**What:** Build a `<details>/<summary>` TOC HTML string from collected headings. Prepend to the fragment HTML.

**When to use:** When `headings.length >= 2` (single-heading documents don't need a TOC).

**Example:**
```javascript
function buildTocHtml(headings) {
  if (headings.length < 2) return '';
  const minLevel = Math.min(...headings.map(h => h.level));
  const items = headings.map(h => {
    const indent = (h.level - minLevel) * 16;
    return `<li style="padding-left:${indent}px"><a href="#${h.slug}">${escapeHtml(h.title)}</a></li>`;
  }).join('\n');
  return `<details class="doc-toc">
  <summary class="doc-toc-toggle">Table of Contents</summary>
  <nav><ul>${items}</ul></nav>
</details>`;
}
```

### Pattern 3: Relative .md Link Interception (Client-Side Delegated Handler)

**What:** Single delegated click handler on the content container intercepts `<a href="...md">` clicks. Resolves relative path against current file path. Calls existing `loadFile()` / `loadPhaseFile()` pipeline.

**When to use:** After any `innerHTML` injection in `loadFile()` and `loadPhaseFile()`.

**Example:**
```javascript
// Source: SPA pattern, History API
function interceptMdLinks(containerEl, currentFilePath, sourceName) {
  containerEl.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) return;
    if (!href.endsWith('.md') && !href.includes('.md#')) return;

    e.preventDefault();
    // Resolve relative to current file's directory
    const dir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/') + 1);
    const resolved = resolvePath(dir + href);  // simple path normalization
    const hashUrl = buildBrowseHash(sourceName, resolved);
    history.pushState(null, '', hashUrl);
    loadFile(sourceName, resolved);
  });
}

// Path normalization (no node:path on client — use string ops):
function resolvePath(p) {
  const parts = p.split('/');
  const out = [];
  for (const seg of parts) {
    if (seg === '..') out.pop();
    else if (seg !== '.') out.push(seg);
  }
  return out.join('/');
}
```

**For detail page (loadPhaseFile):** The content pane (`#phase-content`) loads files by absolute path. Relative links must be resolved against the absolute path of the currently-loaded file. The resolved path is already absolute and can be passed directly to `/render?path=`.

### Pattern 4: Hash Fragment Scroll (NAV-05 bonus)

**What:** When a URL contains a hash (e.g. `#some-heading`), scroll to the element after content loads.

**When to use:** After `innerHTML` injection in both `loadFile()` and `loadPhaseFile()`.

**Example:**
```javascript
// After contentEl.innerHTML = html:
const targetHash = window.location.hash.slice(1);
if (targetHash) {
  const el = contentEl.querySelector('#' + CSS.escape(targetHash));
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}
```

### Anti-Patterns to Avoid

- **Adding `markdown-it-toc-done-right` with `${toc}` placeholder:** Requires every markdown file to contain the placeholder. Use the callback + server-built TOC instead.
- **Adding permalink click handlers in server-rendered HTML:** anchor tag `href="#slug"` works natively; no JS needed to make in-page hash links work. The browser handles same-page anchor navigation automatically.
- **Rewriting links server-side in `/render`:** The server doesn't know which SPA context (browse view vs detail view) is loading the document; client interception handles both.
- **Using `event.target` directly for click delegation:** Use `e.target.closest('a[href]')` to handle clicks on child elements inside `<a>` tags.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Heading ID generation + slugification | Custom regex slug function | `markdown-it-anchor` | Handles duplicate slugs, unicode, edge cases; maintains stable slug-to-heading mapping |
| Heading anchor permalink markup | Manual heading post-processing | `markdown-it-anchor` permalink styles | Plugin integrates into markdown-it render pipeline; avoids fragile regex on HTML output |

**Key insight:** The `markdown-it-anchor` callback pattern is the correct integration point — it fires synchronously during `md.render()` and provides slug+title without any HTML parsing.

---

## Common Pitfalls

### Pitfall 1: headingsBuffer Not Cleared Between Renders

**What goes wrong:** Headings from document A appear in document B's TOC because the buffer is module-level and accumulates across calls.

**Why it happens:** `md.render()` is synchronous; the callback fires during render. If `headingsBuffer.length = 0` is not called before each render, previous headings persist.

**How to avoid:** Always clear the buffer immediately before calling `md.render()`.

**Warning signs:** TOC shows headings that don't exist in the current document.

### Pitfall 2: Concurrency Race on headingsBuffer

**What goes wrong:** If two simultaneous render requests run, their callbacks interleave into a shared `headingsBuffer`.

**Why it happens:** Node.js is single-threaded but async — two `renderMarkdown()` calls can be interleaved at await points. However, `md.render()` itself is synchronous. The risk only exists if `await` calls happen between `headingsBuffer.length = 0` and `md.render()`.

**How to avoid:** Do not `await` anything between clearing the buffer and calling `md.render()`. The Mermaid pre-pass uses `await` — clear the buffer AFTER the Mermaid pre-pass, immediately before `md.render()`.

**Warning signs:** Intermittent wrong headings under load.

### Pitfall 3: Relative Link Resolution Missing `..` Normalization

**What goes wrong:** Link `../docs/guide.md` from file `.planning/phases/05/05-PLAN.md` resolves to `.planning/phases/05/../docs/guide.md` which the server rejects because the literal string doesn't match a real path.

**Why it happens:** Client-side doesn't have `path.normalize()`. String concatenation without normalization leaves `..` segments in the path.

**How to avoid:** Use the `resolvePath()` helper (see Pattern 3) that walks path segments and collapses `..`.

**Warning signs:** 403 or 404 on relative links that should exist.

### Pitfall 4: Anchor clicks triggering link interception

**What goes wrong:** Clicking a `#heading-id` permalink link triggers the `.md` link interceptor, causing a spurious `loadFile()` call.

**Why it happens:** The interceptor checks `href` but forgets to skip fragment-only links.

**How to avoid:** In the click handler, return early if `href.startsWith('#')`.

**Warning signs:** Page reloads or content flicker when clicking heading anchor links.

### Pitfall 5: Detail View vs Browse View Context

**What goes wrong:** Relative link interception in the detail view (project drill-down, `#phase-content`) doesn't know the source name for `buildBrowseHash()`.

**Why it happens:** `loadPhaseFile()` uses absolute paths and doesn't track source context the same way `loadFile()` does.

**How to avoid:** Store current source name on the content container as a `data-source` attribute alongside the existing `data-*` pattern (`#detail-body` already has `dataset.sourcePath`). Read it in the interceptor.

**Warning signs:** Relative links in the detail view navigate to wrong source or throw errors.

---

## Code Examples

Verified patterns from confirmed testing:

### markdown-it-anchor Registration (CJS, verified working)
```javascript
// Source: tested in Node.js 25 with markdown-it-anchor 9.2.0
const anchor = require('markdown-it-anchor');
md.use(anchor, {
  level: [2, 3, 4],
  permalink: anchor.permalink.ariaHidden({ placement: 'before' }),
  callback: (token, info) => headingsBuffer.push({
    level: parseInt(token.tag.slice(1)),
    slug: info.slug,
    title: info.title
  })
});
// Result: <h2 id="hello-world" tabindex="-1"><a class="header-anchor" href="#hello-world" aria-hidden="true">#</a> Hello World</h2>
```

### Updated renderMarkdown() Signature
```javascript
// Return object instead of bare string
async function renderMarkdown(source) {
  // ... Mermaid pre-pass (with awaits) ...

  headingsBuffer.length = 0;  // clear AFTER awaits, BEFORE md.render()
  const bodyHtml = md.render(source);
  const headings = [...headingsBuffer];

  const tocHtml = buildTocHtml(headings);
  const fullBody = `<div class="markdown-body">${bodyHtml}</div>`;
  return tocHtml ? tocHtml + fullBody : fullBody;
  // OR return { html: ..., headings } if caller needs headings separately
}
```

**NOTE:** Current callers expect `renderMarkdown()` to return a string. The simplest approach is to prepend the TOC inside `renderMarkdown()` and keep the return type as a string. No caller changes needed.

### TOC HTML with details/summary
```html
<details class="doc-toc">
  <summary class="doc-toc-toggle">Table of Contents</summary>
  <nav>
    <ul>
      <li><a href="#section-1">Section 1</a></li>
      <li style="padding-left:16px"><a href="#subsection-1-1">Subsection 1.1</a></li>
    </ul>
  </nav>
</details>
```

### CSS for TOC (add to markdown.css or theme.css)
```css
.doc-toc {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  margin-bottom: 1.5rem;
  background: var(--bg-elevated);
  font-size: 0.875rem;
}
.doc-toc-toggle {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-muted);
  list-style: none;
}
.doc-toc-toggle::-webkit-details-marker { display: none; }
.doc-toc ul { margin: 0.5rem 0 0; padding: 0; list-style: none; }
.doc-toc li { line-height: 1.8; }
.doc-toc a { color: var(--text-link); text-decoration: none; }
.doc-toc a:hover { text-decoration: underline; }
.header-anchor {
  color: var(--text-muted);
  text-decoration: none;
  opacity: 0;
  margin-right: 0.4em;
  font-size: 0.9em;
  transition: opacity 0.15s;
}
h2:hover .header-anchor,
h3:hover .header-anchor,
h4:hover .header-anchor { opacity: 1; }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| markdown-it-anchor v8 `renderPermalink` | v9 `permalink: anchor.permalink.*()` style functions | v9.0 (2022) | Old options deprecated; must use new style API |
| `permalink: true` boolean | `permalink: anchor.permalink.ariaHidden()` function | v9.0 | Boolean form triggers deprecation warning |

**Deprecated/outdated:**
- `permalink: true` with `permalinkSymbol`, `permalinkBefore`, `permalinkClass`: triggers deprecation warning in v9; replaced by `anchor.permalink.ariaHidden()` / `anchor.permalink.linkInsideHeader()` style functions.

---

## Open Questions

1. **TOC depth: h2-h3 or h2-h4?**
   - What we know: CONTEXT.md leaves this to Claude's discretion
   - What's unclear: Documents in this project use h2-h4 depth; some PLAN.md files use h3/h4 for sections
   - Recommendation: Default to h2-h3 (`level: [2, 3]`); h4 adds noise for short documents. Planner can choose `[2, 3, 4]` if desired.

2. **Cross-source relative links**
   - What we know: CONTEXT.md leaves cross-source behavior to discretion
   - What's unclear: A `.md` link that resolves outside the current source's path would hit a 403 from the server
   - Recommendation: Let the server 403 surface naturally; show an error in the content pane. No special cross-source handling needed in v1.

3. **Hash in URL bar for detail view (NAV-05)**
   - What we know: The detail view (`#phase-content`) uses a hash-based routing scheme (`#/project/...`) already
   - What's unclear: Adding a heading hash (`#section`) would conflict with the SPA's own hash routing
   - Recommendation: For the detail view specifically, heading anchors work for in-page scrolling but the URL bar hash update is only reliable in the browse view. Plan should handle this distinction.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no version, bundled with Node 20+) |
| Config file | none — test files discovered via `node --test test/` |
| Quick run command | `node --test test/renderer.test.js` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-04 | Relative `.md` link in rendered HTML has correct `href` (not rewritten by server) | unit | `node --test test/renderer.test.js` | ✅ (extend) |
| NAV-04 | Client resolvePath() normalizes `../` correctly | unit | `node --test test/server.test.js` | ✅ (extend) |
| NAV-05 | Headings h2-h4 get `id` attributes in rendered HTML | unit | `node --test test/renderer.test.js` | ✅ (extend) |
| NAV-05 | Duplicate headings get unique IDs (`-2` suffix) | unit | `node --test test/renderer.test.js` | ✅ (extend) |
| NAV-06 | `renderMarkdown()` prepends `.doc-toc` element when headings present | unit | `node --test test/renderer.test.js` | ✅ (extend) |
| NAV-06 | No TOC prepended for documents with fewer than 2 headings | unit | `node --test test/renderer.test.js` | ✅ (extend) |
| NAV-06 | TOC links reference correct anchor slugs | unit | `node --test test/renderer.test.js` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `node --test test/renderer.test.js`
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. New tests extend `test/renderer.test.js` with NAV-04/05/06 describe blocks.

---

## Sources

### Primary (HIGH confidence)
- `markdown-it-anchor` 9.2.0 — verified by installing and running in Node.js 25 CJS environment
- `markdown-it-toc-done-right` 4.2.0 — verified CJS-compatible with markdown-it v14 (not needed for final approach)
- `/Users/mstone/src/github.com/stonematt/gsd-browser/src/renderer.js` — existing render pipeline examined directly
- `/Users/mstone/src/github.com/stonematt/gsd-browser/public/index.html` — existing SPA click handlers and `loadFile()` / `loadPhaseFile()` examined directly

### Secondary (MEDIUM confidence)
- [markdown-it-anchor README](https://github.com/valeriangalliat/markdown-it-anchor/blob/master/README.md) — permalink style API confirmed
- [markdown-it-toc-done-right README](https://github.com/nagaozen/markdown-it-toc-done-right) — plugin API confirmed (not used)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both plugins tested in CJS environment, API confirmed
- Architecture: HIGH — existing codebase examined; integration points are clear and well-precedented
- Pitfalls: HIGH — pitfalls derived from actual code examination and verified plugin behavior
- Client-side patterns: MEDIUM — link interception pattern is standard SPA; specific interaction with SPA hash routing needs care in detail view

**Research date:** 2026-03-28
**Valid until:** 2026-06-28 (stable libraries; markdown-it-anchor v9 has been stable since 2022)
