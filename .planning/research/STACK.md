# Stack Research

**Domain:** Local markdown server, npx-distributable CLI, developer tool
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (core framework choices HIGH, theming details MEDIUM)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | >=20 LTS | Runtime | Fastify v5 requires Node 20+; aligns with GSD's CJS distribution; long-term support |
| Fastify | ^5.8 | HTTP server | 2-3x faster than Express; built-in TypeScript types; active v5 release (Oct 2024); minimal overhead for a local tool |
| markdown-it | ^14.1 | Markdown → HTML rendering | Secure by default; CommonMark compliant; plugin ecosystem; 15.7M weekly downloads; maintained |
| Shiki | ^4.0 | Syntax highlighting in code blocks | Server-side HTML generation (zero client JS); supports 100+ languages and themes; inline styles (no extra CSS file) |
| @fastify/static | ^8.x | Serve bundled UI assets (CSS, client JS) | Official Fastify plugin; integrates cleanly with Fastify v5 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| open | ^10.x | Auto-open browser on server start | Use for the `--open` flag; ESM-only, use dynamic `import()` from CJS entry if needed |
| @catppuccin/palette | ^1.x | Catppuccin CSS variable definitions | Import CSS file to provide `--ctp-*` CSS custom properties for theme switching |
| github-markdown-css | ^5.x | Base markdown prose styling | Provides GitHub-like typography for rendered markdown body — familiar to developers |
| markdown-it-anchor | ^9.x | Auto-generate heading anchors with IDs | Enables in-page navigation for long documents; pairs with TOC if added later |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js built-in `fs/promises` | Fresh disk reads per request | Use `fsPromises.readFile()` — no caching layer, every request re-reads from disk |
| Node.js built-in `path` | Cross-platform path resolution | Use `path.resolve()` and `path.join()` — never string concatenation |
| Node.js built-in `os` | Config file location | Use `os.homedir()` to store source registry at `~/.gsd-browser/sources.json` |
| `npm pack --dry-run` | Validate distribution contents | Run before publish to verify no secrets leak and no source files are missing |

## Installation

```bash
# Core runtime dependencies
npm install fastify @fastify/static markdown-it @shikijs/markdown-it

# Theming + prose styling
npm install @catppuccin/palette github-markdown-css

# Supporting utilities
npm install markdown-it-anchor open

# Dev dependencies only
npm install -D @types/markdown-it
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify v5 | Express 4/5 | Express if you need the widest middleware ecosystem or have existing Express expertise; Express 5 finally stable but Fastify is faster and better typed |
| Fastify v5 | Hono | Hono if targeting edge runtimes (Cloudflare Workers) — unnecessary complexity for a local tool |
| markdown-it | marked | Never — marked is not secure by default and is not CommonMark compliant (see macwright.com/2024/01/28/dont-use-marked) |
| markdown-it | remark/unified | remark if you need an AST pipeline (MDX, custom transforms) — overkill for HTML rendering |
| Shiki | highlight.js | highlight.js if you need synchronous highlighting in a tight loop — Shiki quality is significantly better for developer tools |
| Shiki | Prism | Prism if targeting the browser client-side — Shiki is server-side and produces better output |
| Native JSON file (fs + os) | node-persist | node-persist for complex storage patterns; plain JSON file is sufficient and has zero dependencies |
| github-markdown-css | @primer/css | Primer CSS if building a full GitHub-design-system UI — too heavy for this use case |
| open (npm) | child_process exec | `open` package for safety (uses spawn, cross-platform) — never exec for this |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| marked | Not secure by default (requires DOMPurify); not CommonMark compliant; original author recommends against it | markdown-it |
| showdown | Unmaintained; not CommonMark compliant; low download trend | markdown-it |
| Express.js | 2-3x slower than Fastify for same workload; weaker TypeScript support; Fastify is the modern standard for greenfield | Fastify |
| WebSocket / chokidar | Out of scope — project explicitly excludes live-reload; adds complexity and dependencies for no gain | None — serve fresh on request |
| React / Vue / Svelte | Heavy client-side framework adds build step, complexity, and bundle size for what is fundamentally rendered HTML + vanilla JS | Vanilla JS + CSS custom properties |
| SQLite / better-sqlite3 | Relational DB for source registry is overkill; sources are a small list of paths | Plain JSON file at `~/.gsd-browser/sources.json` |
| node-json-file-storage / node-persist | Adds dependency for trivial key-value storage; reading/writing a single JSON file with `fs/promises` is sufficient | `fs.promises.readFile` / `writeFile` |
| Bundled frontend framework CSS (Bootstrap, Tailwind) | Adds build complexity and large CSS for what should be minimalist developer UI; Tailwind requires a build step | github-markdown-css + CSS custom properties + hand-written layout CSS |

## Stack Patterns by Variant

**For the npx distribution entry point:**
- Use a `bin/gsd-browser.cjs` (CommonJS) entry point with `#!/usr/bin/env node` shebang
- GSD uses `.cjs` files distributed via npm — match that pattern exactly
- Set `"bin": { "gsd-browser": "./bin/gsd-browser.cjs" }` in `package.json`
- Keep the bin file thin: parse CLI args, call into `src/server.js`

**For Shiki with markdown-it (async integration):**
- Shiki's markdown-it plugin requires async setup — call `createHighlighter()` once at server startup, store the instance, then pass it to markdown-it
- Do NOT re-create the Shiki highlighter per request — it loads theme/grammar files and is expensive to initialize

**For theming (Catppuccin + others):**
- Define a `data-theme` attribute on `<html>` with values like `catppuccin-mocha`, `catppuccin-latte`, `github-dark`, `github-light`
- Use CSS custom properties (`--color-bg`, `--color-text`, `--color-link`, etc.) as semantic variables
- Map Catppuccin's `--ctp-*` variables into semantic variables per theme block
- Persist theme choice in `localStorage` on the client side — no server config needed

**For multi-source/repo registry:**
- Store sources as JSON: `[{ "name": "my-project", "path": "/abs/path/to/repo", "active": true }]`
- File location: `~/.gsd-browser/sources.json` (use `os.homedir()`)
- Read on every request (tiny file, no caching needed); write only on register/unregister

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| fastify@^5 | Node.js >= 20 | v5 dropped Node 18 support — enforce engines field in package.json |
| @fastify/static@^8 | fastify@^5 | Major version aligned with Fastify v5 |
| open@^10 | Node.js >= 18 | ESM-only; from CJS entry use `await import('open')` dynamic import |
| shiki@^4 | Node.js >= 18, ESM | ESM-only package — same dynamic import pattern as `open` if using CJS entry |
| markdown-it@^14 | Node.js >= 12 | Supports both CJS and ESM; no breaking compat issues |

## Sources

- [npm-compare: marked vs markdown-it vs remark vs showdown](https://npm-compare.com/markdown-it,marked,remark,showdown) — download counts and feature comparison (MEDIUM confidence)
- [macwright.com: Don't use marked](https://macwright.com/2024/01/28/dont-use-marked) — authoritative critique of marked with alternatives (HIGH confidence)
- [Shiki: Installation & Usage](https://shiki.matsu.io/guide/install) — current version v4.0.2, ESM-only confirmed (HIGH confidence)
- [Fastify v5 release announcement](https://blog.platformatic.dev/fastify-v5-is-here) — v5 GA October 2024, requires Node 20 (HIGH confidence)
- [Fastify releases: current v5.8.1](https://github.com/fastify/fastify/releases) — verified current stable (HIGH confidence)
- [@fastify/static npm](https://www.npmjs.com/package/@fastify/static) — v8.3.0 current (HIGH confidence)
- [markdown-it GitHub](https://github.com/markdown-it/markdown-it) — v14.1.1, CommonMark compliant, secure by default (HIGH confidence)
- [@catppuccin/palette npm](https://www.npmjs.com/package/@catppuccin/palette) — CSS variables via `@import` (MEDIUM confidence — version not pinned)
- [github-markdown-css by sindresorhus](https://github.com/sindresorhus/github-markdown-css) — minimal CSS for GitHub-style markdown prose (HIGH confidence)
- [open npm package](https://github.com/sindresorhus/open) — ESM-only, cross-platform browser open (HIGH confidence)
- [npm package.json bin field docs](https://docs.npmjs.com/files/package.json/) — bin field pattern for npx distribution (HIGH confidence)
- [BetterStack: Express vs Fastify 2025](https://betterstack.com/community/guides/scaling-nodejs/fastify-express/) — benchmark comparison confirming Fastify performance lead (MEDIUM confidence)

---
*Stack research for: gsd-browser — local markdown server, npx-distributable*
*Researched: 2026-03-13*
