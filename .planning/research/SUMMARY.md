# Project Research Summary

**Project:** gsd-browser
**Domain:** Local markdown server / npx-distributable developer documentation browser
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

gsd-browser is a local HTTP server distributed via `npx` that renders GitHub-Flavored Markdown files in a browser with syntax highlighting, a file tree sidebar, and multi-repository source registration. The key insight from research is that no existing tool in this space (markserv, madness, docsify) solves the multi-repo use case: every competitor serves a single directory with no persistence across invocations. The differentiating feature is a persistent source registry (`~/.config/gsd-browser/sources.json`) that lets users register multiple repos once and switch between them in the UI without restarting the server. This is what justifies building this tool rather than wrapping markserv.

The recommended stack is Fastify v5 + markdown-it + Shiki, running on Node.js >=20. The frontend is deliberately vanilla JavaScript — no build step, no framework, no dist folder — because the tool must work as a clean `npx` invocation. State is split into three layers: persistent (sources.json via `conf`), session (localStorage for theme and last-viewed source), and runtime (none — the server is fully stateless between requests). Render-on-request is the central design constraint: every markdown file is read fresh from disk on every request, which is the trust contract with users who are watching AI agents write files.

The critical risks are security (path traversal out of registered source roots and markdown XSS), distribution mechanics (npx version caching, npm package name squatting), and configuration persistence (config stored in CWD instead of a user-scoped OS path). All three are preventable in the foundation phase with specific implementation choices: `fs.realpath()` boundary checks, Content-Security-Policy headers, explicit `127.0.0.1` binding, and the `env-paths` / `conf` packages for cross-platform config storage. The npm package name `gsd-browser` must be claimed before any development begins.

## Key Findings

### Recommended Stack

The stack is well-researched and high-confidence. Fastify v5 is recommended over Express because it is 2-3x faster and has superior TypeScript support, though for a single-user local tool this primarily matters for correctness of the TypeScript types and the modern plugin API. markdown-it is the correct markdown parser — it is secure by default (unlike marked/showdown), CommonMark compliant, and has 15.7M weekly downloads. Shiki v4 provides server-side syntax highlighting that produces zero client JavaScript: the highlighted HTML is rendered on the server and sent as a string, which is the right architecture for a tool with no build step.

Key version constraints: Fastify v5 requires Node.js >=20 (enforced via `engines` in package.json). Shiki and `open` are ESM-only packages; the CJS entry point (`bin/gsd-browser.cjs`) must use `await import('open')` and `await import('@shikijs/markdown-it')` dynamic imports. The Shiki highlighter is initialized once at server startup and reused across requests — recreating it per request is a critical performance mistake.

**Core technologies:**
- Node.js >=20 LTS: runtime — Fastify v5 requires it; also aligns with GSD distribution pattern
- Fastify v5: HTTP server — 2-3x faster than Express; built-in types; active v5 (Oct 2024)
- markdown-it v14: markdown rendering — secure by default; CommonMark compliant; plugin ecosystem
- Shiki v4: syntax highlighting — server-side HTML generation; zero client JS; 100+ languages
- @fastify/static v8: static asset serving — official plugin aligned with Fastify v5
- conf (npm): source registry persistence — XDG-compliant cross-platform config; preferred over env-paths + manual JSON
- open v10: browser launch — ESM-only; cross-platform; used for `--open` flag

### Expected Features

The market gap is clearly documented: no npx-distributable Node.js markdown server handles multi-repo source registration. markserv is the closest ancestor but was last actively maintained around 2019 and serves only a single directory. gsd-browser's MVP must include multi-source registration plus the file tree sidebar to be meaningfully different from markserv.

**Must have (table stakes):**
- GFM markdown rendering with syntax highlighting — the core job-to-be-done; users notice missing tables immediately
- Directory listing / file tree sidebar — navigation is the primary UX; flat listing alone is insufficient
- Serve fresh content on every request — stated design constraint and trust contract with AI-agent users
- Dark mode default (Catppuccin Mocha) — non-negotiable for developer tools in 2026; ships feeling finished
- Port configurable via `--port` flag — conflicts with Vite/webpack are common in developer environments
- npx zero-install entry point — the distribution model; must work without global install
- Source registration: `gsd-browser add <path>` persists across restarts — the differentiating feature
- Repo switcher UI (dropdown) — switching repos must not require restarting the server
- Convention-based auto-discovery of `.planning/`, `docs/`, `README.md` — validates zero-config premise

**Should have (competitive differentiators):**
- Relative markdown link resolution — likely needed in v1; navigation breaks on relative links during testing
- Clickable heading anchors — GFM standard; users share links to sections
- Mermaid diagram rendering — GSD planning docs use Mermaid; raw fenced blocks are jarring
- Inline per-document TOC — long planning documents benefit from visible section navigation
- Catppuccin theme variants (Latte, Frappe, Macchiato) + theme switcher
- Copy-to-clipboard on code blocks — standard UX for developer tools

**Defer (v2+):**
- Per-directory grep-based search — validate navigation-only is sufficient first
- Additional theme palettes (Solarized, One Dark, Nord) — Catppuccin covers the use case
- Keyboard navigation shortcuts — mouse navigation is sufficient for v1 doc browsing
- Open-in-editor integration — OS-specific complexity; validate demand before building

**Anti-features to avoid:**
- Live reload / file watching — the project explicitly excludes this; fresh-on-request is the correct model
- File editing / write-back — breaks the read-only trust contract
- Full-text search (v1) — indexing latency and staleness are real problems; defer
- Authentication — personal localhost tool; auth breaks zero-install experience
- Mobile-responsive layout — developer planning docs on phones is a non-use-case

### Architecture Approach

The architecture is a thin layered system: CLI entry point (arg parsing only) → Fastify HTTP server → service layer (Renderer, FileSystem Service, SourceStore) → data layer (disk files + sources.json). All components are designed to be independently testable. The server is fully stateless between requests — there is no in-memory cache, no session state, no shared mutable state. This makes the tool safe for concurrent requests from the browser without any synchronization concerns.

The frontend is a vanilla JavaScript SPA shell: one HTML file with a file tree sidebar, a content pane, and a repo switcher dropdown. The client fetches rendered HTML fragments from `/file?path=...`, tree JSON from `/tree?source=...`, and manages source registration via `/api/sources`. Theme switching is entirely client-side: swapping a CSS `<link>` href and persisting the selection to `localStorage`. No build step exists or should exist.

**Major components:**
1. CLI Entry (`bin/gsd-browser.cjs`) — parse argv; call `server.start()`; thin; no logic
2. SourceStore (`src/sources.js`) — CRUD for registered repos; persists to `~/.config/gsd-browser/sources.json` via `conf`
3. FileSystem Service (`src/filesystem.js`) — `readFile`, directory tree walk, convention discovery, path safety validation
4. Renderer (`src/renderer.js`) — markdown-it instance with Shiki plugin; initialized once at startup; pure string-in/HTML-out
5. HTTP Routes (`src/routes/`) — thin wiring of services; validates paths; returns JSON or HTML fragments
6. Frontend Shell (`public/app.js` + `public/themes/`) — vanilla JS; CSS custom properties; no build step

**Build order (from architecture research):**
SourceStore → FileSystem Service → Renderer → HTTP Routes → HTTP Server → CLI Entry → Frontend Shell → Themes

### Critical Pitfalls

1. **Path traversal out of registered source roots** — Use `path.resolve()` + `fs.realpath()` (to follow symlinks) then assert the result starts with `resolve(registeredRoot) + path.sep`. All three steps required; `path.normalize()` alone is insufficient (CVE-2023-26111, CVE-2025-27210). Address in Phase 1 before any UI work.

2. **Markdown XSS via unsanitized HTML output** — Use markdown-it (secure by default) and add `Content-Security-Policy: default-src 'self'; script-src 'none'` to all responses. CSP is a free defense even if the parser is correct. Address in Phase 1 alongside rendering.

3. **Server binding to 0.0.0.0** — Always bind to `127.0.0.1` explicitly. Binding to all interfaces exposes private planning docs on shared networks (coffee shops, open Wi-Fi). Add `--host` flag for opt-in LAN access only. Address in Phase 1.

4. **Config stored in CWD** — Use the `conf` package (or `env-paths`) for cross-platform user-scoped config. macOS uses `~/Library/Preferences/`, not `~/.config/` — do not implement XDG manually. Address in Phase 2 when persistence is introduced.

5. **npm package name not claimed** — Run `npm view gsd-browser` immediately. If it 404s, publish a stub `0.0.1` before writing any code. Typosquatters actively register plausible CLI tool names. Address before Phase 1.

6. **npx version staleness** — Print version at startup; document `npx gsd-browser@latest`; optionally add a non-blocking update check. Users will silently run old code otherwise. Address in distribution phase.

## Implications for Roadmap

Based on combined research, the following phase structure is recommended. Phase ordering is driven by: (a) security pitfalls that must be in the foundation, (b) service layer build order from architecture research, and (c) the dependency graph from features research (SourceStore is required by everything).

### Phase 0: Project Setup
**Rationale:** Pre-development hygiene that blocks everything else. The npm name must be claimed before any work starts.
**Delivers:** Claimed npm package name, initialized repository, package.json with correct `bin` entry and `engines` field, placeholder `0.0.1` published to npm.
**Addresses:** Pitfall 6 (npm name squatting)
**Research flag:** Standard — no research needed; follow PITFALLS.md checklist exactly.

### Phase 1: Foundation — Secure Core Server
**Rationale:** Security pitfalls (path traversal, XSS, network binding) must be baked in from day one. Retrofitting security is harder than starting with it. Architecture research confirms the service build order starts with SourceStore and FileSystem.
**Delivers:** Fastify server on `127.0.0.1`; path-safe file serving with `fs.realpath()` boundary checks; CSP headers; `Cache-Control: no-store` on markdown responses; port conflict handling with human-readable errors.
**Addresses:** Pitfall 1 (path traversal), Pitfall 2 (XSS), Pitfall 3 (network binding), UX: startup URL print, UX: port conflict message
**Stack elements used:** Fastify v5, Node.js fs/promises, path module
**Architecture components:** HTTP Server, FileSystem Service (path validation only at this stage)
**Research flag:** Standard — security patterns from PITFALLS.md are specific and actionable; no additional research needed.

### Phase 2: Markdown Rendering
**Rationale:** Core job-to-be-done. Must be isolated and testable before being wired into routes. Renderer has no dependencies on other services.
**Delivers:** markdown-it instance with Shiki syntax highlighting (initialized once at startup); GFM rendering; heading anchors; rendered HTML fragments served from `/file?path=...`; fresh-from-disk on every request.
**Addresses:** Table stakes: GFM rendering, syntax highlighting, fresh content, heading anchors
**Stack elements used:** markdown-it v14, Shiki v4 (with dynamic import from CJS entry), markdown-it-anchor, github-markdown-css
**Architecture components:** Renderer, `/file` route
**Pitfall:** Do NOT re-create the Shiki highlighter per request — create once at startup, store instance.
**Research flag:** Standard — markdown-it + Shiki integration is well-documented in STACK.md with specific async setup pattern.

### Phase 3: Source Registration and Persistence
**Rationale:** The differentiating feature. Everything unique about gsd-browser versus markserv depends on the source registry. Must be built before the UI can show a repo switcher.
**Delivers:** `gsd-browser add <path>` persists sources; `gsd-browser list` shows registered sources; `gsd-browser remove <name>` removes; sources survive restarts and cross-directory invocations; convention-based auto-discovery of `.planning/`, `docs/`, `README.md` on registration.
**Addresses:** Differentiator: multi-source registration, convention-based discovery; Pitfall 4 (CWD config), Pitfall 5 (relative paths stored — always resolve to absolute at registration time)
**Stack elements used:** conf (npm package for XDG-compliant persistence), path.resolve() at registration time, fs.realpath()
**Architecture components:** SourceStore, `/api/sources` route, FileSystem Service (convention discovery)
**Research flag:** Standard — conf package pattern is documented in ARCHITECTURE.md; cross-platform path is documented in PITFALLS.md.

### Phase 4: Browser UI Shell
**Rationale:** Once the server exposes `/file`, `/tree`, and `/api/sources` endpoints, the frontend can be built against a real API. Building the UI after the API prevents the common mistake of designing the UI first and retrofitting the API to match.
**Delivers:** Single-page HTML shell with file tree sidebar, content pane, repo switcher dropdown, active repo name in header. Vanilla JavaScript only — no build step. Default Catppuccin Mocha dark theme.
**Addresses:** Table stakes: file tree sidebar, repo switcher, dark mode default, directory listing, readable typography
**Stack elements used:** @fastify/static (serve public/), @catppuccin/palette, CSS custom properties, github-markdown-css, vanilla JS
**Architecture components:** Frontend Shell, Theme Engine, `/tree` route
**Research flag:** Standard — three-panel layout, vanilla JS SPA, CSS custom property theming are well-established patterns documented in ARCHITECTURE.md. No research needed.

### Phase 5: Polish and Navigation
**Rationale:** Navigation features (relative links, heading anchors are already in Phase 2, but TOC and Mermaid are more complex) and UI polish (theme switcher, copy-to-clipboard) that make the tool feel complete but don't block the core use case.
**Delivers:** Relative markdown link resolution; inline per-document TOC; copy-to-clipboard on code blocks; Catppuccin theme variants (Latte, Frappe, Macchiato) with theme switcher persisted to localStorage.
**Addresses:** Should-have features: relative links, TOC, copy-to-clipboard, theme switcher
**Research flag:** Standard for relative links and TOC. Mermaid rendering (if included here) needs attention — the client-side `mermaid.js` integration has complexity around lazy loading and CSP. Flag for research if Mermaid is included in this phase.

### Phase 6: Distribution and Publication
**Rationale:** npx mechanics must be validated before public launch. The version staleness pitfall and shebang/bin mechanics are non-obvious and easy to get wrong.
**Delivers:** `npm pack --dry-run` validation; correct shebang and bin entry; version printed at startup; startup message recommending `@latest`; published to npm as `gsd-browser@1.0.0`.
**Addresses:** Pitfall 3 (npx version staleness), Pitfall 6 (package name — already claimed in Phase 0); "looks done but isn't" checklist from PITFALLS.md
**Stack elements used:** open v10 (with dynamic import for `--open` flag)
**Research flag:** Standard — PITFALLS.md has specific checklist items; STACK.md has the CJS/ESM bin entry pattern.

### Phase Ordering Rationale

- **Security before UI:** Path traversal and XSS vulnerabilities found in comparable tools (CVE-2023-26111, CVE-2025-24981) were introduced during feature development, not found during foundation work. Building the secure file serving foundation first prevents this.
- **SourceStore before Frontend:** The repo switcher UI requires the source registry API. Building the API first allows UI to be built against a real contract.
- **Renderer before Routes:** markdown-it + Shiki initialization is async and must happen once at server startup. Testing the renderer standalone (Phase 2) before wiring into routes (also Phase 2) reduces debugging surface.
- **API before UI:** The architecture research explicitly recommends defining JSON shapes from routes before building the frontend. This is enforced by building routes in Phase 3-4 and UI in Phase 4.
- **Polish after core:** Mermaid, TOC, and theme variants are v1.x features per FEATURES.md. They should not block v1 launch.

### Research Flags

Phases needing deeper research during planning:
- **Phase 5 (Mermaid rendering):** If Mermaid is included, the client-side `mermaid.js` integration interacts with the CSP header (`script-src 'none'` will block inline Mermaid scripts). Research needed on the correct CSP policy for a Mermaid-enabled tool.

Phases with standard patterns (skip research-phase):
- **Phase 0:** Five-minute npm claim; no research needed.
- **Phase 1:** Path safety and CSP patterns are fully specified in PITFALLS.md with code examples.
- **Phase 2:** markdown-it + Shiki setup pattern is documented in STACK.md with specific async initialization guidance.
- **Phase 3:** conf package usage is documented in ARCHITECTURE.md with code examples.
- **Phase 4:** Three-panel vanilla JS SPA with CSS custom property theming is well-established; examples exist in ARCHITECTURE.md.
- **Phase 6:** PITFALLS.md has specific checklist for npx distribution validation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core packages (Fastify v5, markdown-it v14, Shiki v4) verified against current releases; version compatibility table is accurate; ESM/CJS interop pattern for Shiki and open is specified |
| Features | HIGH | Well-established domain; 4 direct competitors analyzed; market gap (multi-source registration) is clearly documented; feature table has dependency graph |
| Architecture | HIGH | Component boundaries are clear; data flows are specified; build order is explicit; anti-patterns are documented with code examples |
| Pitfalls | HIGH | 6 critical pitfalls with CVE references; prevention code is included; pitfall-to-phase mapping is explicit |

**Overall confidence:** HIGH

### Gaps to Address

- **Mermaid + CSP interaction:** The research recommends `script-src 'none'` as a universal CSP policy, but Mermaid rendering requires JavaScript execution. This conflict is not resolved in the research. Resolution options: use `mermaid.js` as a server-side render (possible with jsdom or headless rendering), defer Mermaid to v1.x as intended, or add a CSP nonce for the Mermaid script specifically. Flag for Phase 5 planning.

- **conf vs env-paths + manual JSON:** STACK.md recommends plain JSON with `os.homedir()`, while ARCHITECTURE.md and PITFALLS.md recommend `conf` package. PITFALLS.md also mentions `env-paths`. The synthesized recommendation is `conf` (it handles XDG + macOS + Windows correctly without manual implementation), but this should be validated against the GSD project's preference for minimal dependencies.

- **Relative link resolution scope:** FEATURES.md marks this as P2 but notes "likely v1; move up if navigation breaks on relative links during testing." This needs a decision during Phase 4 planning: if `.planning/` docs use relative links to each other (common in GSD artifacts), this is effectively required for v1.

## Sources

### Primary (HIGH confidence)
- [Fastify v5 release](https://blog.platformatic.dev/fastify-v5-is-here) — v5 GA October 2024, Node 20 requirement confirmed
- [markdown-it GitHub](https://github.com/markdown-it/markdown-it) — v14.1.1, secure by default, CommonMark compliant
- [Shiki installation guide](https://shiki.matsu.io/guide/install) — v4.0.2, ESM-only, async initialization required
- [github-markdown-css by sindresorhus](https://github.com/sindresorhus/github-markdown-css) — minimal CSS for GitHub-style prose
- [open npm package](https://github.com/sindresorhus/open) — ESM-only, cross-platform
- [conf (npm)](https://www.npmjs.com/package/conf) — XDG-compliant config storage
- [CVE-2023-26111: node-static path traversal](https://security.snyk.io/vuln/SNYK-JS-NODESTATIC-3149928) — real-world local server vulnerability
- [CVE-2025-27210: Node.js path traversal via Windows device names](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows)
- [macwright.com: Don't use marked](https://macwright.com/2024/01/28/dont-use-marked) — authoritative marked critique

### Secondary (MEDIUM confidence)
- [markserv/markserv on GitHub](https://github.com/markserv/markserv) — competitor analysis; last maintained ~2019
- [DannyBen/madness on GitHub](https://github.com/DannyBen/madness) — sidebar, search, TOC, Mermaid patterns
- [Textualize/frogmouth on GitHub](https://github.com/Textualize/frogmouth) — browser-like navigation patterns
- [@catppuccin/palette npm](https://www.npmjs.com/package/@catppuccin/palette) — CSS variable approach to theming
- [BetterStack: Express vs Fastify 2025](https://betterstack.com/community/guides/scaling-nodejs/fastify-express/) — benchmark data
- [aikido.dev: npx confusion and unclaimed package names](https://www.aikido.dev/blog/npx-confusion-unclaimed-package-names) — name squatting risk

### Tertiary (LOW confidence)
- [Express 5 vs Fastify 2025 (Medium)](https://medium.com/codetodeploy/express-or-fastify-in-2025-whats-the-right-node-js-framework-for-you-6ea247141a86) — notes Express may be simpler for local tool; not adopted as recommendation

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
