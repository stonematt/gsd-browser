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
- [ ] **Phase 4.5: GSD Dashboard** - Multi-project progress dashboard with phase timeline, editorial context, and branch awareness (INSERTED)
- [ ] **Phase 5: Navigation Polish** - Relative link resolution, heading anchors, inline TOC, and Mermaid diagrams
- [ ] **Phase 6: Distribution** - npx zero-install packaging, npm publication, and startup UX

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
**Plans:** 3 plans

Plans:
- [ ] 04.5-01-PLAN.md — Server-side API endpoints + parsing utilities (dashboard data, phase detection, git branch operations)
- [ ] 04.5-02-PLAN.md — Dashboard landing page SPA with project cards, multi-view routing, and browse view preservation
- [ ] 04.5-03-PLAN.md — Project detail page with phase timeline, documentation viewer, and branch awareness + visual verification

### Phase 5: Navigation Polish
**Goal**: Documents with internal links, heading anchors, and Mermaid diagrams navigate and render correctly
**Depends on**: Phase 4
**Requirements**: NAV-04, NAV-05, NAV-06
**Success Criteria** (what must be TRUE):
  1. Clicking a relative markdown link within a source navigates to the correct file
  2. Heading anchors are auto-generated and clicking them scrolls to the correct section; URLs can be copied and shared
  3. An inline table of contents appears per document, generated from the document's headings
**Plans**: TBD

### Phase 6: Distribution
**Goal**: Anyone can run gsd-browser with a single npx command and nothing pre-installed
**Depends on**: Phase 5
**Requirements**: SERV-01, DIST-01, DIST-02
**Success Criteria** (what must be TRUE):
  1. `npx gsd-browser` on a machine with no prior install starts the server and opens the browser
  2. The package is published on npm as a public package and `npm view gsd-browser` returns the package metadata
  3. The startup message prints the current version and the server URL
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 4.5 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete   | 2026-03-13 |
| 2. Rendering | 2/2 | Complete   | 2026-03-13 |
| 3. Source Registration | 3/3 | Complete   | 2026-03-20 |
| 4. Browser UI | 2/2 | Complete   | 2026-03-22 |
| 4.5. GSD Dashboard | 0/3 | Not started | - |
| 5. Navigation Polish | 0/TBD | Not started | - |
| 6. Distribution | 0/TBD | Not started | - |
