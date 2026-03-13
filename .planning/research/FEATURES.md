# Feature Research

**Domain:** Local markdown server / developer documentation browser
**Researched:** 2026-03-13
**Confidence:** HIGH (well-established domain with multiple comparable products)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| GitHub-Flavored Markdown (GFM) rendering | Every markdown tool renders GFM — tables, strikethrough, task lists, fenced code, footnotes | LOW | Use `marked` or `remark` + `remark-gfm`. Users notice missing tables immediately. |
| Syntax highlighting in code blocks | GitHub, VS Code, and every modern viewer highlights code blocks | LOW | `highlight.js` or `shiki` integrate cleanly. Language detection expected. |
| Directory listing / file index | Navigating into a folder shows files, not a 404 | LOW | Render directory as a list of links sorted by name. Standard in every comparable tool. |
| Clickable heading anchors | Users share links to sections; jump links within TOC require this | LOW | Auto-generated from heading text. GFM standard behavior. |
| Serve fresh file content on every request | Users updating files mid-session expect to see changes on next load | LOW | No caching. This is a design constraint, not a feature to implement — just avoid caching. |
| Readable default typography | Text is legible at normal reading width without custom config | LOW | Max-width prose container, sensible line height. Bare minimum polish. |
| Port configurable at startup | Conflicts with other local servers (Vite, Webpack, etc.) are common | LOW | CLI flag `--port`. Standard in all local server tools. |
| Relative markdown links work | Authors write `[See also](../docs/guide.md)` — these must navigate | MEDIUM | Resolve relative to serving root. markserv, madness, and allmark all handle this. |
| Dark mode | Developer audience expects dark mode as default or quick toggle | LOW | CSS custom properties or prefers-color-scheme. Non-negotiable for dev tools in 2026. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-source registration with persistence | No existing npx tool handles multi-repo source registration; markserv and madness serve a single directory | MEDIUM | JSON config in `~/.config/gsd-browser/sources.json` or XDG path. Add/remove/list via CLI subcommands (`add`, `remove`, `list`). |
| Convention-based auto-discovery of `.planning/`, `docs/`, `README.md` | Zero config for GSD artifact trees; users don't need to know paths | LOW | Walk registered repo roots looking for known directories. Can be opt-out. |
| Repo switcher UI (dropdown/hamburger) | Jump between multiple registered repos without restarting or typing URLs | MEDIUM | Top-bar dropdown populated from the sources registry. Fundamental navigation for multi-repo use. |
| File tree sidebar | Explicit tree structure of the active source, always visible | MEDIUM | Collapsible tree in the left column. Frogmouth and madness both prove this is high-value for doc browsers. Users orient faster with a tree than with breadcrumbs alone. |
| Terminal-palette theming (Catppuccin, etc.) | Developer audience is opinionated about aesthetics — Catppuccin has ports for hundreds of tools and is actively maintained as of 2026 | MEDIUM | Catppuccin palette is published as a JS package (`@catppuccin/palette`). Build theme switcher with Mocha, Frappe, Latte, Macchiato variants. Also include Solarized and One Dark as alternatives. |
| npx-first, zero-install UX | Users can evaluate immediately with `npx gsd-browser`; no global install required | LOW | Requires a clean `bin` entry in `package.json` and no build step on install. Sibling pattern to how GSD itself works. |
| Mermaid diagram rendering | GSD and planning docs increasingly include Mermaid. Users see fenced ```mermaid blocks as rendered diagrams instead of raw text | MEDIUM | `mermaid.js` integrates client-side. The rendering is JavaScript-heavy; load lazily. Madness marks this as optional; follow that lead. |
| Explicit custom path registration | Some repos have docs outside conventions (`notes/`, `wiki/`, custom paths) | LOW | CLI: `gsd-browser add /path/to/repo --extra-path notes/`. Extends the auto-discovery result. |
| Inline table of contents per document | Long planning documents benefit from a visible TOC in the sidebar or inline | MEDIUM | Extract headings from rendered AST. Auto-generate. Frogmouth and madness both do this. |
| Copy-to-clipboard on code blocks | Standard UX for any tool developers use daily | LOW | Small JS injection. One button per code block. No library needed. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Live reload / file watching / WebSocket push | Developers want changes to appear instantly | Adds OS-level file watcher complexity, WebSocket connection management, and reconnect logic. For a tool viewing files that AI agents write (not you), instant push is less valuable than freshness on navigation. Scope creep risk is high. | Fresh-on-request: every page load reads from disk. Navigation is the reload trigger. This matches the use case — you navigate to a file after the agent writes it. |
| File editing / write-back | Users will want to annotate or fix docs in-browser | Makes this a full editor; breaks the "read-only" trust model. Introduces conflict with the agent writing the same file. | Open in editor button: shell-opens the file in `$EDITOR` or passes path to the OS. Read-only stays the contract. |
| Full-text search across repos | Obvious discoverability feature | Indexing latency, index staleness (stale when agents actively write), and scope creep. Building a real search index is a significant system. | Per-file Cmd+F (browser native). Per-directory: defer to v2, build with a simple grep-based approach if validated. |
| Authentication / access control | Might seem needed for "sharing" | This is a personal developer tool on localhost. Auth adds config complexity and breaks the zero-install experience. | Document that the server binds to localhost only. |
| Mobile-responsive layout | Seems like good practice | Developer planning docs on phones is a non-use-case. Responsive design requires a fundamentally different layout architecture that conflicts with file tree + content + repo switcher. | Desktop browser is the deliberate target. |
| Plugin / extension system | Power users always ask for extensibility | Plugin systems are maintenance magnets. Designing a good plugin API is a project in itself and adds surface area before core is stable. | Bake in the features worth having (Mermaid, theming); keep everything else out. Re-evaluate at v2. |
| Obsidian integration / Obsidian vault support | Superficially related — both browse markdown | Obsidian uses proprietary link syntax (`[[wikilinks]]`), plugins, and a vault model with metadata. This is a different UX contract from plain-file browsing. | Document the distinction: this tool is for live artifact trees, Obsidian is for curated knowledge. |
| Automatic port conflict resolution | Seems developer-friendly | Silent port changes confuse users debugging multiple services. | Error clearly on conflict, suggest `--port` flag. |

## Feature Dependencies

```
Source Registration (add/remove/list)
    └──required by──> Persistence (sources.json)
    └──required by──> Repo Switcher UI
                          └──required by──> Convention-based Auto-discovery
                                                (populates switcher automatically)

File Tree Sidebar
    └──requires──> Active Source Selection (from Repo Switcher)
    └──enhances──>  Directory Listing (tree view replaces flat index)

GFM Rendering
    └──required by──> Anchor Links
    └──required by──> Inline TOC (headings come from rendered AST)
    └──required by──> Mermaid support (fenced block detection)
    └──required by──> Copy-to-clipboard (code block injection)

Syntax Highlighting
    └──enhances──> GFM Rendering (applied to fenced code blocks)

Theming (Catppuccin etc.)
    └──enhances──> Dark Mode (dark mode becomes a subset of theming)

Relative Link Resolution
    └──requires──> Source Root awareness (must know the registered path)
```

### Dependency Notes

- **Source Registration requires Persistence:** The registry must survive process restarts. A JSON file in the user's home config dir is sufficient. Do not use a database.
- **File Tree Sidebar requires Active Source Selection:** Tree renders relative to the selected repo root. No selected source = empty or placeholder state.
- **Inline TOC requires GFM Rendering:** TOC is extracted from the parsed AST, not from raw markdown strings. Implement rendering before TOC.
- **Mermaid requires GFM Rendering:** Mermaid blocks are detected as fenced code blocks with language `mermaid`. Detection and substitution happen post-render.
- **Theming enhances Dark Mode:** Shipping Catppuccin Mocha as the default dark theme satisfies dark mode without a separate implementation.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] `npx gsd-browser` starts a local HTTP server — why essential: zero-friction evaluation
- [ ] GFM markdown rendering with syntax highlighting — why essential: the core job-to-be-done
- [ ] Source registration: `gsd-browser add <path>` persists across restarts — why essential: multi-repo is the differentiating concept; without it this is just markserv
- [ ] Convention-based auto-discovery of `.planning/`, `docs/`, `README.md` — why essential: validates the zero-config premise
- [ ] Repo switcher (dropdown in UI) — why essential: switching repos must not require restarting the server
- [ ] File tree sidebar for current source — why essential: navigation is the primary UX; flat directory listing alone is insufficient
- [ ] Serve fresh from disk on every request — why essential: stated design constraint, trust contract with the user
- [ ] Dark default theme (Catppuccin Mocha or equivalent) — why essential: developer audience; ships feeling finished

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Catppuccin theme variants (Latte, Frappe, Macchiato) + theme switcher — trigger: user feedback that single theme is limiting
- [ ] Mermaid diagram rendering — trigger: GSD research/planning docs use Mermaid; user reports seeing raw fenced blocks
- [ ] Inline per-document TOC — trigger: users report difficulty navigating long planning documents
- [ ] Copy-to-clipboard on code blocks — trigger: any user feedback; low effort, high polish signal
- [ ] Relative markdown link resolution — trigger: should probably be in v1; move up if navigation breaks on relative links during testing
- [ ] Clickable heading anchors — trigger: as above, likely v1

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Per-directory grep-based search — why defer: validate that navigation alone is sufficient first
- [ ] Additional theme palettes (Solarized, One Dark, Nord) — why defer: Catppuccin covers the use case; wait for requests
- [ ] Keyboard navigation shortcuts — why defer: mouse navigation is sufficient for v1 doc browsing; add if power users request
- [ ] `open in editor` integration — why defer: shell integration adds OS-specific complexity; validate demand first

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GFM rendering | HIGH | LOW | P1 |
| Source registration + persistence | HIGH | MEDIUM | P1 |
| Convention-based auto-discovery | HIGH | LOW | P1 |
| Repo switcher UI | HIGH | MEDIUM | P1 |
| File tree sidebar | HIGH | MEDIUM | P1 |
| Fresh-from-disk serving | HIGH | LOW | P1 |
| Dark default theme | HIGH | LOW | P1 |
| Syntax highlighting | HIGH | LOW | P1 |
| npx zero-install entry point | HIGH | LOW | P1 |
| Mermaid rendering | MEDIUM | MEDIUM | P2 |
| Theme switcher (Catppuccin variants) | MEDIUM | LOW | P2 |
| Inline per-document TOC | MEDIUM | MEDIUM | P2 |
| Relative link resolution | HIGH | LOW | P2 |
| Clickable heading anchors | MEDIUM | LOW | P2 |
| Copy-to-clipboard on code blocks | MEDIUM | LOW | P2 |
| Per-directory grep search | MEDIUM | HIGH | P3 |
| Keyboard shortcuts | LOW | MEDIUM | P3 |
| Open in editor | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | markserv | madness | frogmouth | docsify | gsd-browser |
|---------|----------|---------|-----------|---------|-------------|
| GFM rendering | Yes (GitHub-style) | Yes (GitHub-compat) | Yes | Yes | Yes |
| Syntax highlighting | Yes | Yes | Yes | Yes | Yes |
| Directory listing | Yes | No (sidebar nav) | No (file picker) | No (single site) | Tree sidebar |
| Live reload | Yes (WebSocket) | No | N/A | Yes | No (fresh-on-request) |
| File tree sidebar | No | Yes (auto-generated) | Yes | Yes (plugin) | Yes |
| Full-text search | No | Yes (built-in) | No | Yes (plugin) | No (v1) |
| Multi-repo / multi-source | No | No | No | No | Yes (differentiator) |
| Source registration | No | No | No | No | Yes |
| Convention-based discovery | No | No | No | No | Yes |
| Theming | 4 built-in themes | Fully customizable CSS | Terminal colors | Fully customizable | Catppuccin + variants |
| npx zero-install | Yes | No (Ruby gem) | No (Python) | Partial (docsify-cli) | Yes |
| Inline TOC | No | Yes (per-page) | Yes (auto-extracted) | Yes | v1.x |
| Mermaid support | No | Yes (optional) | No | Yes (plugin) | v1.x |
| Bookmark / history | No | No | Yes (full browser-like) | No | No |
| Table of contents (site-wide) | No | Yes | No | Yes | No |
| Basic auth | No | Yes (optional) | No | No | No |

**Key gap in the market:** No existing npx-distributable, Node.js markdown server handles multi-repo source registration. markserv is the closest ancestor but serves only a single directory, has no persistence, and was last actively maintained around 2019.

## Sources

- [markserv/markserv on GitHub](https://github.com/markserv/markserv) — feature list, themes, live-reload approach
- [markserv on npm](https://www.npmjs.com/package/markserv) — distribution and install pattern
- [DannyBen/madness on GitHub](https://github.com/DannyBen/madness) — sidebar, search, TOC, Mermaid support, auth
- [Madness Markdown Server official site](https://madness.dannyb.co/) — feature overview
- [Textualize/frogmouth on GitHub](https://github.com/Textualize/frogmouth) — browser-like navigation, bookmarks, history, TOC
- [Frogmouth feature overview (BrightCoding, 2025)](https://www.blog.brightcoding.dev/2025/09/06/frogmouth-a-terminal-markdown-browser-with-navigation-bookmarks-and-table-of-contents/) — comprehensive feature list
- [docsifyjs/docsify](https://docsify.markdownguide.org) — plugin ecosystem, sidebar, search
- [remark-gfm](https://github.com/remarkjs/remark-gfm) — GFM feature set (autolinks, footnotes, strikethrough, tables, tasklists)
- [GitHub Flavored Markdown Spec](https://github.github.com/gfm/) — authoritative GFM feature list
- [Evil Martians: Six things developer tools must have](https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption) — speed, discoverability, consistency, resilience
- [Catppuccin](https://catppuccin.com/) — palette definition, ecosystem breadth
- [Material for MkDocs — navigation setup](https://squidfunk.github.io/mkdocs-material/setup/setting-up-navigation/) — breadcrumbs, TOC, back-to-top UX standards

---
*Feature research for: local markdown server / developer documentation browser*
*Researched: 2026-03-13*
