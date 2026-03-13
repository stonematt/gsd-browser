# Phase 2: Rendering - Research

**Researched:** 2026-03-13
**Domain:** Server-side markdown rendering: markdown-it, Shiki, Mermaid, GitHub-style CSS
**Confidence:** HIGH (core stack) / MEDIUM (Mermaid server-side approach)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**HTML delivery model**
- Server returns a full HTML page (complete `<html>` document with `<head>` and `<body>`) for rendered markdown
- Separate `/render` route for rendered HTML — existing `/file` route stays for raw file access
- Minimal breadcrumb header at top of each rendered page showing the file path
- Root URL (`/`) renders `README.md` from the registered root if present; falls back to directory listing
- Phase 4 replaces this standalone HTML wrapper with its 3-panel UI shell

**Visual styling**
- GitHub-like markdown aesthetic — familiar headings, subtle rules, proper table borders, clean list indentation
- Dark default background with light text (consistent with Phase 4's DSGN-02 dark theme)
- Separate stylesheet served from the server (e.g., `/styles/markdown.css`) — not inline in each page
- Phase 4 extends or replaces this stylesheet when adding theming

**Mermaid rendering**
- Server-side SVG rendering — Mermaid diagrams rendered to static SVG on the server
- Strict CSP (`script-src 'none'`) stays intact — no client-side JavaScript needed
- Dark-compatible Mermaid theme so SVGs look native on the dark background
- Failure fallback: show raw Mermaid source in a syntax-highlighted code block, plus error message
- Graceful degradation — page renders even if Mermaid rendering fails

**Code block presentation**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-02 | Server renders GitHub-Flavored Markdown (tables, task lists, fenced code, strikethrough, footnotes) | markdown-it v14 + plugin ecosystem covers all GFM features |
| SERV-03 | Code blocks display with syntax highlighting and language detection | Shiki v4 + @shikijs/markdown-it integration, async pattern |
| REND-01 | Mermaid fenced code blocks render as diagrams | svgdom + mermaid approach; mermaid-isomorphic requires Playwright — recommend svgdom |
| REND-02 | Readable default typography with max-width prose container | github-markdown-css v5.9.0 dark-only variant + custom overrides |
</phase_requirements>

---

## Summary

Phase 2 builds a server-side rendering pipeline that transforms raw markdown files into polished, GitHub-like HTML pages. The pipeline is: file read → markdown-it (GFM parse) → Shiki (syntax highlight code fences) → Mermaid (render diagram fences to SVG) → HTML page template → Fastify response. All work happens on the server; the strict `script-src 'none'` CSP stays intact.

The core markdown-it + Shiki stack is well-established and straightforward. The critical integration challenge is Shiki's ESM-only distribution in a CJS project: use `await import('shiki')` or `await import('@shikijs/markdown-it')` inside an async initializer, instantiate a singleton highlighter at server startup, then use it synchronously per request. Markdown-it itself does not support async highlighting natively; Shiki's markdown-it plugin works around this via pre-initialization before `md.use()` is called.

Mermaid server-side rendering is the most complex part of this phase. The official mermaid library requires a DOM environment; the svgdom-based approach is the lightest working option that does not require Playwright/Puppeteer. The pattern: polyfill `globalThis.window` and `globalThis.document` using `svgdom`, call `mermaid.render()` with `htmlLabels: false`, and inline the resulting SVG. `mermaid-isomorphic` (the main npm alternative) requires Playwright + a headless Chromium install — too heavy for this tool's zero-config distribution goal.

**Primary recommendation:** markdown-it v14 + markdown-it-task-lists + markdown-it-footnote + @shikijs/markdown-it + mermaid + svgdom + github-markdown-css (dark-only variant). Serve the stylesheet via @fastify/static.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| markdown-it | ^14.x | GFM markdown parser | Native tables + strikethrough; fast; plugin ecosystem; CJS-friendly; already in Phase 1 research |
| @shikijs/markdown-it | ^3.x (ships with shiki ^4.x) | Shiki markdown-it integration | Official Shiki plugin; handles async init + sync use per request |
| shiki | ^4.x | Syntax highlighting engine | TextMate grammars; same engine as VS Code; ESM-only but usable via dynamic import in CJS |
| mermaid | ^11.x | Diagram rendering | Official library; broad diagram type support; usable server-side via svgdom |
| svgdom | ^0.1.x | Fake DOM for Mermaid | Lightest working approach for server-side Mermaid without headless browser |
| github-markdown-css | ^5.9.0 | GitHub-style markdown CSS | Exact GitHub aesthetic; ships dark-only variant; zero custom CSS for prose baseline |
| @fastify/static | ^8.x | Static file serving for CSS | Fastify v5 compatible; serves `public/styles/` directory |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| markdown-it-task-lists | ^2.1.x | GitHub-style task list checkboxes | Required for `- [x]` and `- [ ]` syntax |
| markdown-it-footnote | ^4.x | Footnote support (`[^1]`) | Required by SERV-02 spec |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| svgdom + mermaid | mermaid-isomorphic | mermaid-isomorphic requires `playwright` + `npx playwright install --with-deps chromium` — 500MB+ download; incompatible with npx zero-install goal |
| svgdom + mermaid | @mermaid-js/mermaid-cli (programmatic API) | Also requires Puppeteer ^23; same distribution problem |
| github-markdown-css | Custom hand-rolled CSS | github-markdown-css is 8 years battle-tested; tables, nested lists, task checkboxes all handled correctly |
| @shikijs/markdown-it | markdown-it-shiki (antfu's original) | @shikijs/markdown-it is the official successor; markdown-it-shiki is deprecated |

**Installation:**
```bash
npm install markdown-it markdown-it-task-lists markdown-it-footnote shiki @shikijs/markdown-it mermaid svgdom github-markdown-css @fastify/static
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── server.js           # Fastify server — add /render route and @fastify/static registration
├── renderer.js         # NEW: markdown pipeline (markdown-it + Shiki + Mermaid)
└── filesystem.js       # Existing — reused as-is for path safety
public/
└── styles/
    └── markdown.css    # NEW: imports github-markdown-css dark variant + custom overrides
test/
├── renderer.test.js    # NEW: unit tests for the renderer pipeline
└── server.test.js      # Existing — extend for /render and / routes
```

### Pattern 1: Singleton Highlighter Initialization

Shiki is ESM-only. In a CJS project, use dynamic import in an async initializer. Create the highlighter once at module load and reuse it per request.

**What:** Initialize Shiki at module load time via async IIFE; expose a synchronous `highlight(code, lang)` function to markdown-it.
**When to use:** Any time Shiki is used in a CJS module.

```javascript
// Source: https://shiki.style/guide/install + https://shiki.style/packages/markdown-it
'use strict';

let highlighter = null;

async function initHighlighter() {
  const { createHighlighter } = await import('shiki');
  highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: ['javascript', 'typescript', 'python', 'bash', 'json', 'yaml',
            'markdown', 'html', 'css', 'rust', 'go', 'java', 'sql', 'diff'],
  });
}

// Called once at server startup before accepting requests
module.exports = { initHighlighter, getHighlighter: () => highlighter };
```

### Pattern 2: markdown-it + Shiki Integration (Pre-init Approach)

markdown-it's `highlight` callback is synchronous. The workaround: pre-initialize Shiki, then pass the singleton instance's synchronous `.codeToHtml()` method as the highlight callback.

```javascript
// Source: https://shiki.style/guide/install (codeToHtml) + https://shiki.style/packages/markdown-it
const MarkdownIt = require('markdown-it');
const taskLists  = require('markdown-it-task-lists');
const footnote   = require('markdown-it-footnote');

function createMarkdownRenderer(highlighter) {
  const md = new MarkdownIt({
    html: false,           // disable raw HTML in markdown (security)
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (!highlighter || !lang) return '';  // fallback: markdown-it default escaping
      try {
        return highlighter.codeToHtml(code, { lang, theme: 'github-dark' });
      } catch {
        return '';
      }
    },
  });

  md.use(taskLists, { enabled: true });
  md.use(footnote);

  return md;
}
```

### Pattern 3: Mermaid Server-Side SVG via svgdom

Mermaid requires a DOM. svgdom provides a minimal SVG-aware DOM environment. Key requirements: set `htmlLabels: false` (browser-layout-dependent), `startOnLoad: false`.

```javascript
// Source: https://github.com/mermaid-js/mermaid/issues/6634 (documented working pattern)
'use strict';

let mermaidReady = false;

async function initMermaid() {
  const { createHTMLWindow } = await import('svgdom');
  const mermaidModule = await import('mermaid');
  const mermaid = mermaidModule.default;

  const svgWindow = createHTMLWindow();
  globalThis.window   = svgWindow;
  globalThis.document = svgWindow.document;

  mermaid.initialize({
    startOnLoad: false,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    securityLevel: 'strict',
    theme: 'dark',           // use mermaid's built-in dark theme
  });

  mermaidReady = true;
  return mermaid;
}

async function renderMermaidDiagram(source, id) {
  // id must be unique per page render; use a counter
  const mermaid = await getMermaid();
  const { svg } = await mermaid.render(id, source);
  return svg;  // inline SVG string, safe to embed in HTML
}
```

### Pattern 4: Custom Mermaid Fence Rule

Intercept markdown-it's fenced code block rendering. Identify `mermaid` language blocks; render them to SVG inline. Non-mermaid blocks fall through to Shiki.

```javascript
// Source: markdown-it renderer override pattern (markdown-it docs)
const defaultFence = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.fence = async function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const lang  = (token.info || '').trim();

  if (lang === 'mermaid') {
    // Note: md.render() is sync; mermaid fence must be pre-processed
    // See Pattern 5 for the pre-processing approach
    return token.meta?.mermaidSvg || fallbackMermaidBlock(token.content);
  }
  return defaultFence(tokens, idx, options, env, self);
};
```

### Pattern 5: Two-Pass Render Strategy for Mermaid

Because markdown-it's render is synchronous but Mermaid rendering is async, use a two-pass approach: (1) parse markdown to extract mermaid blocks, render them async, (2) pass rendered SVGs in via `env` or pre-substitution, then call `md.render()`.

```javascript
// Recommended approach for this project
async function renderMarkdown(markdownSource, md, mermaid) {
  // Pass 1: find all ```mermaid blocks and render to SVG
  const mermaidPattern = /^```mermaid\n([\s\S]*?)^```/gm;
  const svgCache = new Map();
  let diagramIndex = 0;

  for (const match of markdownSource.matchAll(mermaidPattern)) {
    const diagramSource = match[1];
    const key = `mermaid-${diagramIndex++}`;
    try {
      const svg = await renderMermaidDiagram(diagramSource, key);
      svgCache.set(diagramSource, { svg, error: null });
    } catch (err) {
      svgCache.set(diagramSource, { svg: null, error: err.message });
    }
  }

  // Pass 2: override fence renderer to inject SVGs, then render markdown
  md.renderer.rules.fence = makeFenceRenderer(svgCache, defaultFenceRenderer);
  return md.render(markdownSource);
}
```

### Pattern 6: @fastify/static for CSS

Register @fastify/static to serve the stylesheet from `public/styles/`.

```javascript
// Source: https://github.com/fastify/fastify-static (v8.x docs)
const path = require('node:path');
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/styles/',
  // decorateReply: false  // only if using multiple registrations
});
```

### Pattern 7: CSS — GitHub Dark Variant

The `github-markdown-css` package ships pre-built variants. Use the dark-only file directly rather than the auto-switching default.

```css
/* public/styles/markdown.css */
/* Source: https://github.com/sindresorhus/github-markdown-css (v5.9.0) */

/* Import the dark-only variant — avoids the prefers-color-scheme media query */
/* Copy file: node_modules/github-markdown-css/github-markdown-dark.css */

/* Project overrides */
body {
  background-color: #0d1117;   /* GitHub dark background */
  color: #e6edf3;
  padding: 2rem 1rem;
}

.markdown-body {
  max-width: 860px;            /* Claude's discretion: 860px is readable without being cramped */
  margin: 0 auto;
  box-sizing: border-box;
}

/* Code blocks: horizontal scroll, no wrap */
.markdown-body pre {
  overflow-x: auto;
  white-space: pre;            /* never wrap */
}

/* Shiki produces inline styles; no extra code highlighting CSS needed */
```

### Anti-Patterns to Avoid

- **Calling `createHighlighter()` per request:** Shiki loads WASM on init; this adds 200-500ms per request. Create once, reuse. State: "avoid calling this function in hot loops."
- **Using `mermaid-isomorphic` or `@mermaid-js/mermaid-cli` as a dependency:** Both require Playwright/Puppeteer (~500MB). Incompatible with `npx gsd-browser` zero-install goal.
- **Setting `html: true` in markdown-it:** Allows arbitrary HTML injection; violates CSP guarantee. Keep `html: false`.
- **Rendering Mermaid inside the synchronous `md.render()` call:** Mermaid's render function is async. Must do a pre-pass before calling `md.render()`.
- **Blocking the event loop during Mermaid init:** svgdom + mermaid initialization is slow (~200ms). Init once at startup, not per request.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GFM table rendering | Custom table parser | markdown-it (built-in) | CommonMark edge cases, colspan, alignment; dozens of correctness bugs possible |
| GFM strikethrough | Regex substitution | markdown-it (built-in) | Nested strikethrough, inline code interaction |
| Task list checkboxes | Regex on `- [ ]` | markdown-it-task-lists | Handles ordered/unordered lists, nesting, mixed content |
| Footnotes | Custom reference tracker | markdown-it-footnote | Back-references, multiple uses, block footnotes |
| Syntax highlighting | Tree-sitter or regex | Shiki (TextMate grammars) | 200+ languages; VS Code parity; inline styles, no runtime JS |
| GitHub markdown CSS | Custom prose stylesheet | github-markdown-css | 8 years of edge cases: nested lists, tables, blockquotes, task checks, prose spacing |
| Static file serving | Custom route for each CSS file | @fastify/static | MIME types, ETags, compression — already in Fastify ecosystem |

**Key insight:** The markdown-it plugin ecosystem has solved every GFM feature correctly; the only custom code needed is the rendering orchestration (the pipeline that calls them in order) and the Mermaid fence interceptor.

---

## Common Pitfalls

### Pitfall 1: Shiki ESM in CJS Module
**What goes wrong:** `require('shiki')` throws `ERR_REQUIRE_ESM` on Node.js < 20.19.0; even on 20.19.0+ it may throw `ERR_REQUIRE_ASYNC_MODULE` if shiki uses top-level await.
**Why it happens:** Shiki is published ESM-only. The project uses CJS (`require`/`module.exports`) throughout.
**How to avoid:** Always use `await import('shiki')` and `await import('@shikijs/markdown-it')` inside async functions. Initialize at startup, not at module load.
**Warning signs:** `ERR_REQUIRE_ESM` in startup logs.

### Pitfall 2: markdown-it Highlight Callback is Synchronous
**What goes wrong:** Returning a Promise from the `highlight` function produces `[object Promise]` in the rendered HTML.
**Why it happens:** markdown-it's highlight callback must be synchronous; it does not await return values.
**How to avoid:** Pre-initialize Shiki highlighter before creating the markdown-it instance. Use `highlighter.codeToHtml()` (synchronous once initialized) inside the callback.
**Warning signs:** Code blocks render as `[object Promise]` in output.

### Pitfall 3: Mermaid htmlLabels: true Crashes Without a Real Browser
**What goes wrong:** `mermaid.render()` hangs or throws because it tries to measure text using DOM APIs that svgdom doesn't implement.
**Why it happens:** Flowchart diagrams with `htmlLabels: true` (the default) use `getBoundingClientRect()` which svgdom does not implement.
**How to avoid:** Always initialize mermaid with `htmlLabels: false` and `flowchart: { htmlLabels: false }`.
**Warning signs:** Mermaid render hangs indefinitely, or throws `TypeError: element.getBoundingClientRect is not a function`.

### Pitfall 4: Global DOM Pollution from Mermaid Init
**What goes wrong:** Setting `globalThis.window` and `globalThis.document` for Mermaid can interfere with other modules that sniff for a browser environment.
**Why it happens:** svgdom polyfill is a crude global assignment.
**How to avoid:** Set globals immediately before mermaid init; document the side effect clearly in `renderer.js`. Test that Fastify's behavior is unaffected after init.
**Warning signs:** Fastify or other libs start behaving as if running in a browser.

### Pitfall 5: github-markdown-css Contains Both Light and Dark Rules
**What goes wrong:** The default `github-markdown.css` file switches themes based on `prefers-color-scheme`. On a page with a dark `<body>` background, code blocks and blockquotes may appear with light backgrounds.
**Why it happens:** The auto-switching file has both `@media (prefers-color-scheme: light)` and dark rules.
**How to avoid:** Use `github-markdown-dark.css` (the dark-only variant) instead of the default file. Copy it into `public/styles/` at build time or reference it from `node_modules/` via the static file route.
**Warning signs:** Code block backgrounds look white/grey in a dark page.

### Pitfall 6: Mermaid SVG Contains Inline `<style>` Tags Blocked by CSP
**What goes wrong:** Mermaid embeds `<style>` tags inside the SVG. Some strict CSP configurations block `style-src 'unsafe-inline'`, causing diagrams to render without styling.
**Why it happens:** Mermaid's SVG output includes `<style>` tags for diagram theming.
**How to avoid:** The current CSP is `default-src 'self'; script-src 'none'; object-src 'none'`. This allows `style-src` to fall through to `default-src 'self'`, which blocks inline styles unless `'unsafe-inline'` is added. Test diagram rendering with the actual CSP. If diagrams lose styling, add `style-src 'self' 'unsafe-inline'` scoped to SVG content, or choose a Mermaid theme that doesn't rely on inline styles.
**Warning signs:** Mermaid SVGs render as plain shapes with no color/styling.

### Pitfall 7: @fastify/static Must Be Registered Before Routes That Use It
**What goes wrong:** `reply.sendFile()` is unavailable or static files return 404.
**Why it happens:** @fastify/static decorates the reply object; it must be registered before routes that need it.
**How to avoid:** Register `@fastify/static` at the top of `createServer()`, before registering the `/render` route.

---

## Code Examples

Verified patterns from official sources:

### Shiki: Create Singleton Highlighter in CJS
```javascript
// Source: https://shiki.style/guide/install
'use strict';
let _highlighter = null;

async function initHighlighter() {
  const { createHighlighter } = await import('shiki');
  _highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: ['javascript', 'typescript', 'python', 'shell', 'bash', 'json',
            'yaml', 'toml', 'markdown', 'html', 'css', 'rust', 'go'],
  });
}

function getHighlighter() { return _highlighter; }
module.exports = { initHighlighter, getHighlighter };
```

### Shiki: Single-call shorthand (simpler, slightly slower startup)
```javascript
// Source: https://shiki.style/guide/install (codeToHtml shorthand)
// Acceptable for dev tool with low startup frequency
const { codeToHtml } = await import('shiki');
const html = await codeToHtml('const a = 1', { lang: 'javascript', theme: 'github-dark' });
```

### markdown-it: Full Pipeline Setup
```javascript
// Source: markdown-it docs + plugin READMEs
const MarkdownIt  = require('markdown-it');
const taskLists   = require('markdown-it-task-lists');
const footnote    = require('markdown-it-footnote');

function buildMarkdownIt(highlighter) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    highlight(code, lang) {
      if (!highlighter) return '';
      const validLang = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';
      try {
        return highlighter.codeToHtml(code, { lang: validLang, theme: 'github-dark' });
      } catch { return ''; }
    },
  });
  md.use(taskLists, { enabled: true });
  md.use(footnote);
  return md;
}
```

### Mermaid: svgdom Init
```javascript
// Source: https://github.com/mermaid-js/mermaid/issues/6634 (community-verified pattern)
async function initMermaid() {
  const { createHTMLWindow } = await import('svgdom');
  const mermaid = (await import('mermaid')).default;

  const win = createHTMLWindow();
  globalThis.window   = win;
  globalThis.document = win.document;

  mermaid.initialize({
    startOnLoad: false,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    securityLevel: 'strict',
    theme: 'dark',
  });
  return mermaid;
}
```

### @fastify/static: Register for CSS Serving
```javascript
// Source: https://github.com/fastify/fastify-static (v8.x)
const path = require('node:path');
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});
```

### HTML Page Template (minimal)
```javascript
function buildPage({ filePath, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(filePath)}</title>
  <link rel="stylesheet" href="/styles/markdown.css">
</head>
<body>
  <header class="breadcrumb">
    <code>${escapeHtml(filePath)}</code>
  </header>
  <main class="markdown-body">
    ${bodyHtml}
  </main>
</body>
</html>`;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| highlight.js client-side | Shiki server-side | 2022-2024 (Shiki v1+) | No runtime JS, CSP-compatible, VS Code grammar parity |
| markdown-it-shiki (antfu) | @shikijs/markdown-it (official) | Shiki v1.0 (2024) | Official package; dual theme support; maintained with Shiki |
| Mermaid client-side script | Server-side SVG (svgdom) | 2023-2024 | Enables strict CSP; works without client JS |
| Custom CSS prose styles | github-markdown-css | Established | Zero maintenance; battle-tested edge cases |
| Shiki require() in CJS | await import('shiki') | Node.js 20.19+ | require(esm) now stable but dynamic import is safer/portable |

**Deprecated/outdated:**
- `markdown-it-shiki` (antfu): Superseded by `@shikijs/markdown-it` — use the official package.
- Shiki v0.x API (`getHighlighter`, `loadTheme`): Replaced in v1.x with `createHighlighter`. v4 removed additional deprecated APIs.
- `createdBundledHighlighter` (typo): Removed in Shiki v4, use `createBundledHighlighter`.
- Mermaid `renderAsync`: Deprecated in v10, removed in later versions. Use `mermaid.render()` (now async).

---

## Open Questions

1. **svgdom Mermaid compatibility with mermaid v11**
   - What we know: The svgdom pattern was documented against mermaid v9-v10; mermaid v11.13.0 is current.
   - What's unclear: Whether `htmlLabels: false` still prevents all browser-API calls in mermaid v11, or whether mermaid added new layout paths that also fail without a real browser.
   - Recommendation: Write a single focused test for mermaid rendering via svgdom immediately after installing packages. If it hangs or throws, implement the fallback path (show raw source + error) and note the limitation in a code comment.

2. **Mermaid SVG inline styles and current CSP**
   - What we know: Mermaid SVGs include `<style>` tags. The CSP `default-src 'self'; script-src 'none'` does not include `style-src 'unsafe-inline'`.
   - What's unclear: Whether browsers block inline `<style>` tags inside an inline SVG element vs. standalone SVG files differently.
   - Recommendation: Test in browser after implementation. If styles are stripped, add `style-src 'self' 'unsafe-inline'` to `CSP_HEADER` and document the decision in `server.js`.

3. **Language detection for unlabeled code blocks**
   - What we know: Shiki's `codeToHtml()` requires a `lang` parameter. markdown-it passes empty string for unlabeled fences.
   - What's unclear: Whether to fall through to plain `<pre>/<code>` or guess language.
   - Recommendation: Use `'text'` (plain text theme) for unlabeled fences — clean, never wrong.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node.js 18+) |
| Config file | none — invoked via `node --test test/` |
| Quick run command | `node --test test/renderer.test.js` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-02 | GFM table renders as `<table>` HTML | unit | `node --test test/renderer.test.js` | Wave 0 |
| SERV-02 | Task list `- [x]` renders with checkbox | unit | `node --test test/renderer.test.js` | Wave 0 |
| SERV-02 | Strikethrough `~~text~~` renders as `<del>` | unit | `node --test test/renderer.test.js` | Wave 0 |
| SERV-02 | Footnote `[^1]` renders with back-link | unit | `node --test test/renderer.test.js` | Wave 0 |
| SERV-03 | Fenced JS block has Shiki-highlighted HTML | unit | `node --test test/renderer.test.js` | Wave 0 |
| SERV-03 | Unlabeled fence renders as plain `<pre>` | unit | `node --test test/renderer.test.js` | Wave 0 |
| REND-01 | Mermaid fence renders as inline `<svg>` | unit | `node --test test/renderer.test.js` | Wave 0 |
| REND-01 | Invalid Mermaid shows fallback code block | unit | `node --test test/renderer.test.js` | Wave 0 |
| REND-02 | `/render` response contains `.markdown-body` wrapper | integration | `node --test test/server.test.js` | Wave 0 |
| REND-02 | `/render` response links to `/styles/markdown.css` | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-02 | GET `/render?path=README.md` returns 200 HTML | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-02 | GET `/render?path=../evil` returns 403 | integration | `node --test test/server.test.js` | Wave 0 |
| SERV-02 | GET `/styles/markdown.css` returns 200 text/css | integration | `node --test test/server.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test test/renderer.test.js`
- **Per wave merge:** `node --test test/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/renderer.test.js` — covers SERV-02, SERV-03, REND-01, REND-02 unit tests
- [ ] Extend `test/server.test.js` — add /render route integration tests and /styles/ static serving tests

*(Existing `test/filesystem.test.js` and `test/server.test.js` cover Phase 1 requirements and need no changes except the noted extensions.)*

---

## Sources

### Primary (HIGH confidence)
- https://shiki.style/guide/install — Shiki v4 installation, codeToHtml API, CJS dynamic import pattern, singleton highlighter
- https://shiki.style/packages/markdown-it — @shikijs/markdown-it integration, dual theme config, async support
- https://shiki.style/blog/v4 — Shiki v4 breaking changes (removed typo APIs, Node.js ≥ 20 required)
- https://github.com/sindresorhus/github-markdown-css — github-markdown-css v5.9.0, dark-only variant, markdown-body class usage
- https://github.com/fastify/fastify-static — @fastify/static v8.x, Fastify v5 compatibility, registration API
- https://github.com/markdown-it/markdown-it — markdown-it GFM built-ins (tables, strikethrough), plugin system

### Secondary (MEDIUM confidence)
- https://github.com/mermaid-js/mermaid/issues/6634 — svgdom + mermaid server-side pattern; community-verified against mermaid v9-v10; v11 compatibility unconfirmed
- https://github.com/remcohaszing/mermaid-isomorphic — Confirmed requires Playwright + Chromium; ruled out for distribution reasons
- https://nodejs.org/en/blog/release/v20.19.0 — require(esm) backported to Node.js 20.19.0 (stable)
- https://github.com/revin/markdown-it-task-lists — markdown-it-task-lists v2.1.1 (last published 8 years ago but widely used, CJS compatible)
- https://github.com/markdown-it/markdown-it-footnote — markdown-it-footnote, official plugin from markdown-it org

### Tertiary (LOW confidence — verify during implementation)
- svgdom + mermaid v11 compatibility — unverified; based on v9/v10 documentation; must test in Wave 0
- Mermaid inline `<style>` tags and CSP interaction — requires browser testing to confirm

---

## Metadata

**Confidence breakdown:**
- Standard stack (markdown-it, Shiki, github-markdown-css, @fastify/static): HIGH — official documentation verified
- Shiki/CJS ESM interop pattern: HIGH — confirmed via official docs + Node.js release notes
- Mermaid svgdom approach: MEDIUM — community-documented, official mermaid issue, but mermaid v11 compatibility unconfirmed
- Architecture (two-pass render, singleton init): HIGH — derived from documented constraints
- Pitfalls: HIGH (CSP, ESM, htmlLabels) / MEDIUM (SVG style CSP interaction)

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable ecosystem; Shiki and markdown-it have slow release cycles; Mermaid moves faster — re-check svgdom compat if mermaid > v11.x)
