# Roadmap: gsd-browser

## Overview

gsd-browser is built in seven phases ordered by dependency and security-first discipline. The foundation establishes a secure, localhost-only file server with path traversal protection before any UI work begins. Rendering and source registration are built as independent services, then wired together in the browser UI shell. A GSD project dashboard (Phase 4.5) surfaces multi-project, multi-branch progress by parsing GSD planning artifacts. Navigation polish and Mermaid rendering follow once core browsing works. Distribution (npx packaging and npm publication) closes the milestone with a validated zero-install experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Secure localhost HTTP server with path safety and CSP headers (completed 2026-03-13)
- [x] **Phase 2: Rendering** - GFM markdown rendering with syntax highlighting, fresh-from-disk on every request (completed 2026-03-13)
- [x] **Phase 3: Source Registration** - CLI source management with persistence and convention-based discovery (completed 2026-03-20)
- [x] **Phase 4: Browser UI** - Vanilla JS frontend shell with file tree, repo switcher, and dark theme (completed 2026-03-22)
- [x] **Phase 4.5: GSD Dashboard** - Multi-project progress dashboard with phase timeline, editorial context, and branch awareness (INSERTED) (completed 2026-03-24)
- [x] **Phase 4.5.1: Dashboard UX Polish** - Timeline overflow strategy, sub-phase visual hierarchy, pending phase visibility on cards, plan status surfacing in sidebar, structured plan metadata display, and requirement tag badges (INSERTED) (completed 2026-03-25)
- [x] **Phase 4.5.2: Theme Token System** - Extract hardcoded colors into CSS custom properties, add light theme via prefers-color-scheme media query (INSERTED)
- [x] **Phase 4.5.3: Dashboard Tile Redesign** - Compressed history / expanded frontier dot strip, branching stems for sub-phases, dot sizing by plan count, depth-aware sub-phase parsing (INSERTED) (completed 2026-03-28)
- [x] **Phase 4.5.4: Detail Page Layout** - Three-column layout with vertical phase navigator, collapsible completed section, col 1 collapse with localStorage persistence, frontmatter stripping from rendered output (INSERTED) (completed 2026-03-29)
- [x] **Phase 5: Navigation Polish** - Relative link resolution, heading anchors, inline TOC, and Mermaid diagrams (completed 2026-03-29)
- [x] **Phase 6: Distribution** - npx zero-install packaging, npm publication, and startup UX (completed 2026-03-30)

## Phase Details

### Phase 1: Foundation
**Goal**: A secure, localhost-only HTTP server exists that safely serves files from registered paths
**Depends on**: Nothing (first phase)
**Requirements**: SERV-04, SERV-05, SERV-06, SERV-07, SERV-08
**Success Criteria** (what must be TRUE):
  1. Server starts and binds exclusively to 127.0.0.1 (not 0.0.0.0)
  2. Every file response includes Cache-Control: no-store, ensuring disk-fresh content
  3. A request for a path outside any registered source root returns a 403, not file content
  4. All responses include Content-Security-Policy headers blocking XSS
  5. Server starts on a custom port when `--port` is passed; prints a clear error on port conflict
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Project scaffold + TDD filesystem module (path traversal protection)
- [x] 01-02-PLAN.md — Fastify server + CLI entry point + integration tests

### Phase 2: Rendering
**Goal**: Markdown files render as readable, syntax-highlighted HTML in the browser
**Depends on**: Phase 1
**Requirements**: SERV-02, SERV-03, REND-01, REND-02
**Success Criteria** (what must be TRUE):
  1. A GFM markdown file with tables, task lists, fenced code, strikethrough, and footnotes renders correctly
  2. Fenced code blocks display with syntax highlighting and language labels
  3. Mermaid fenced code blocks render as diagrams (not raw text)
  4. Prose renders in a max-width container with readable line height and font size
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Rendering pipeline module (markdown-it + Shiki + Mermaid) + CSS stylesheet
- [x] 02-02-PLAN.md — Server route integration (/render, /, static CSS) + visual verification

### Phase 3: Source Registration
**Goal**: Users can manage document sources via CLI and have those sources persist across restarts
**Depends on**: Phase 1
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06
**Success Criteria** (what must be TRUE):
  1. `gsd-browser add <path>` registers a source and it survives a server restart
  2. `gsd-browser remove <path>` removes a source and it no longer appears after restart
  3. `gsd-browser list` prints all registered sources with their resolved paths
  4. When a repo is registered, `.planning/`, `docs/`, and `README.md` are automatically discovered and browsable without extra configuration
  5. User can register and remove sources from the web UI without touching the CLI
**Plans:** 3/3 plans complete

Plans:
- [x] 03-01-PLAN.md — TDD source registry module (config persistence + convention discovery)
- [x] 03-02-PLAN.md — CLI subcommand wiring + server multi-source migration
- [x] 03-03-PLAN.md — REST API endpoints + web management page + visual verification

### Phase 4: Browser UI
**Goal**: Users can navigate between registered repos and browse their file trees in a working browser UI
**Depends on**: Phase 2, Phase 3
**Requirements**: NAV-01, NAV-02, NAV-03, DSGN-01, DSGN-02
**Success Criteria** (what must be TRUE):
  1. A three-panel UI (sidebar + content + header) loads in the browser with a dark default theme
  2. The file tree sidebar shows the directory structure of the active source and is collapsible/expandable
  3. The repo switcher dropdown lists all registered sources and switching between them updates the file tree and content
  4. Clicking a file in the tree renders it in the content pane without a full page reload
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — Tree API endpoint + fragment rendering mode (server-side)
- [x] 04-02-PLAN.md — Three-panel SPA shell with file tree, source switcher, and content pane + visual verification

### Phase 4.5: GSD Dashboard (INSERTED)
**Goal**: A multi-project dashboard surfaces GSD progress, editorial context, and phase documentation across registered sources and branches
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):
  1. A dashboard landing page shows card-style summaries for every registered source that contains `.planning/STATE.md`, with progress percentage and editorial description of current work
  2. Each project card links directly to key files (PROJECT.md, STATE.md, ROADMAP.md) — one click to render
  3. Clicking a project card navigates to a detail page with a horizontal phase timeline showing completed/in-progress/pending phases
  4. Clicking a phase in the timeline shows that phase's documentation (plans, summaries, research, validation) in a sidebar with rendered content pane
  5. For sources that are git repos with multiple branches containing `.planning/`, the dashboard shows per-branch milestone progress (read via `git show <branch>:.planning/STATE.md`)
  6. Non-GSD sources (no `.planning/STATE.md`) still appear on the dashboard but fall back to the file browser view
**Plans:** 3/3 plans complete

Plans:
- [x] 04.5-01-PLAN.md — Server-side API endpoints + parsing utilities (dashboard data, phase detection, git branch operations)
- [x] 04.5-02-PLAN.md — Dashboard landing page SPA with project cards, multi-view routing, and browse view preservation
- [x] 04.5-03-PLAN.md — Project detail page with phase timeline, documentation viewer, and branch awareness + visual verification

### Phase 4.5.1: Dashboard UX Polish (INSERTED)

**Goal:** Dashboard communicates project shape, progress, and plan status at a glance without requiring click-through
**Depends on:** Phase 4.5
**Requirements**: DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, DASH-12
**Success Criteria** (what must be TRUE):
  1. A 12-phase project timeline renders without horizontal overflow — completed phases collapse or wrap
  2. Sub-phases (e.g., 4.5, 4.5.1) visually read as subordinate to their parent integer phase, not as peers
  3. Project cards show pending/future phases as gray indicators so users can see remaining runway
  4. The sidebar visually distinguishes phases with SUMMARY.md (complete) from those without (in-progress/pending)
  5. Plan metadata (wave, dependencies, requirements) renders as a structured card with labeled fields, not raw frontmatter
  6. Requirement tags in plan metadata render as styled chips/badges
**Plans:** 3/3 plans complete

Plans:
- [x] 04.5.1-01-PLAN.md — Server-side requirements parsing in parsePlanFrontmatter + propagation through buildPlanDetails
- [x] 04.5.1-02-PLAN.md — Timeline overflow, sub-phase hierarchy, pending phase indicators, sidebar file classification
- [x] 04.5.1-03-PLAN.md — Structured plan metadata card with requirement chips/badges

### Phase 4.5.2: Theme Token System (INSERTED)

**Goal:** All UI colors defined as CSS custom properties with dark-as-default and light theme support, enabling theme-aware development for all subsequent phases
**Depends on:** Phase 4.5.1
**Requirements**: DSGN-03, DSGN-04
**Success Criteria** (what must be TRUE):
  1. Every hardcoded hex color in index.html and markdown.css is replaced by a CSS custom property (--bg-page, --text-primary, etc.)
  2. Dark mode renders identically to current appearance (no visual regression)
  3. Setting `prefers-color-scheme: light` in the browser produces a readable, properly-contrasted light theme
  4. Status colors (--status-complete, --status-active, --status-pending) are consistent across both themes
**Plans:** 2 plans

Plans:
- [x] 04.5.2-01-PLAN.md — Create theme.css token file (Catppuccin Mocha/Latte) + migrate sources.html, renderer.js, markdown.css
- [x] 04.5.2-02-PLAN.md — Migrate index.html to token references + visual verification of both themes

### Phase 4.5.3: Dashboard Tile Redesign (INSERTED)

**Goal:** Project cards communicate project shape at a glance — compressed completed history, expanded active/future frontier, and branching depth for sub-phases
**Depends on:** Phase 4.5.2
**Requirements**: DASH-13, DASH-14, DASH-15
**Success Criteria** (what must be TRUE):
  1. Completed phases render as small numbered dots; active and future phases show full slug names
  2. Sub-phases (4.5, 4.5.1) branch below their parent on vertical stems, not as linear peers on the main axis
  3. Nested sub-phases (4.5.1) drop to a third row below their parent sub-phase
  4. Dot sizes scale by plan count (0 plans=12px, 1-2=14px, 3-4=16px, 5+=20px); sub-phase dots are 4px smaller
  5. Phase number parsing correctly distinguishes depth levels (4 vs 4.5 vs 4.5.1) without parseFloat truncation
**Plans:** 2/2 plans complete

Plans:
- [ ] 04.5.3-01-PLAN.md — Server-side API enhancements (requirementCount, phaseGoals, depth-2 regex fixes, comparePhaseNums sort)
- [ ] 04.5.3-02-PLAN.md — Frontend card redesign (history strip + frontier list + depth-aware phase utilities) + visual verification

### Phase 4.5.4: Detail Page Layout (INSERTED)

**Goal:** The project detail page uses a three-column layout with a vertical phase navigator that scales to any number of phases and collapses completed history by default
**Depends on:** Phase 4.5.2
**Requirements**: DASH-16, DASH-17, DASH-18, DASH-19
**Success Criteria** (what must be TRUE):
  1. Detail page renders as a 3-column grid: phase navigator (200px, collapsible) | file list (180px) | document content (flex)
  2. Completed phases collapse into a single "N phases complete" row with a mini dot strip; clicking expands the full list
  3. The col 1 collapse toggle hides/shows the phase navigator with a CSS transition; collapse state persists in localStorage across page loads
  4. PLAN.md files render with a structured metadata card (wave, deps, requirements) and the raw YAML frontmatter is stripped from the rendered markdown body
  5. Sub-phases are indented by depth level in the vertical navigator (22px per level)
**Plans:** 2/2 plans complete

Plans:
- [ ] 04.5.4-01-PLAN.md — Server-side frontmatter stripping + three-column grid HTML/CSS structure
- [ ] 04.5.4-02-PLAN.md — Vertical phase navigator, completed collapse, col 1 toggle, file list regrouping + visual verification

### Phase 5: Navigation Polish
**Goal**: Documents with internal links, heading anchors, and Mermaid diagrams navigate and render correctly
**Depends on**: Phase 4
**Requirements**: NAV-04, NAV-05, NAV-06
**Success Criteria** (what must be TRUE):
  1. Clicking a relative markdown link within a source navigates to the correct file
  2. Heading anchors are auto-generated and clicking them scrolls to the correct section; URLs can be copied and shared
  3. An inline table of contents appears per document, generated from the document's headings
**Plans:** 2/2 plans complete

Plans:
- [ ] 05-01-PLAN.md — Server-side heading anchors + inline TOC (markdown-it-anchor, buildTocHtml, CSS styles)
- [ ] 05-02-PLAN.md — Client-side relative link interception + hash scroll in browse and detail views + visual verification

### Phase 6: Distribution
**Goal**: Anyone can run gsd-browser with a single npx command and nothing pre-installed
**Depends on**: Phase 5
**Requirements**: SERV-01, DIST-01, DIST-02
**Success Criteria** (what must be TRUE):
  1. `npx gsd-browser` on a machine with no prior install starts the server and opens the browser
  2. The package is published on npm as a public package and `npm view gsd-browser` returns the package metadata
  3. The startup message prints the current version and the server URL
**Plans:** 2/2 plans complete

Plans:
- [ ] 06-01-PLAN.md — Package metadata, open dependency, first-run CWD detection, auto-open config, startup banner
- [ ] 06-02-PLAN.md — Project README + npm publish verification checkpoint

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 4.5 -> 4.5.1 -> 4.5.2 -> 4.5.3 -> 4.5.4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete   | 2026-03-13 |
| 2. Rendering | 2/2 | Complete   | 2026-03-13 |
| 3. Source Registration | 3/3 | Complete   | 2026-03-20 |
| 4. Browser UI | 2/2 | Complete   | 2026-03-22 |
| 4.5. GSD Dashboard | 3/3 | Complete   | 2026-03-24 |
| 4.5.1. Dashboard UX Polish | 3/3 | Complete   | 2026-03-25 |
| 4.5.2. Theme Token System | 2/2 | Complete | 2026-03-27 |
| 4.5.3. Dashboard Tile Redesign | 2/2 | Complete   | 2026-03-28 |
| 4.5.4. Detail Page Layout | 2/2 | Complete    | 2026-03-29 |
| 5. Navigation Polish | 2/2 | Complete    | 2026-03-29 |
| 6. Distribution | 2/2 | Complete   | 2026-03-30 |
