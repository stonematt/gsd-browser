# Requirements: gsd-browser

**Defined:** 2026-03-13
**Core Value:** Instantly browse and read the markdown artifacts that agents are actively writing, across multiple repos, without leaving the browser.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Server

- [ ] **SERV-01**: Local HTTP server starts with `npx gsd-browser` and opens browser automatically
- [x] **SERV-02**: Server renders GitHub-Flavored Markdown (tables, task lists, fenced code, strikethrough, footnotes)
- [x] **SERV-03**: Code blocks display with syntax highlighting and language detection
- [x] **SERV-04**: Every page load reads fresh file content from disk (no caching)
- [x] **SERV-05**: Server port is configurable via `--port` flag
- [x] **SERV-06**: Server binds to localhost only (127.0.0.1)
- [x] **SERV-07**: Path traversal protection prevents access outside registered sources
- [x] **SERV-08**: CSP headers prevent XSS from rendered markdown content

### Source Management

- [x] **SRC-01**: User can register a repo/directory as a document source via `gsd-browser add <path>`
- [x] **SRC-02**: User can remove a registered source via `gsd-browser remove <path>`
- [x] **SRC-03**: User can list registered sources via `gsd-browser list`
- [x] **SRC-04**: Registered sources persist across server restarts (config file in OS-appropriate location)
- [x] **SRC-05**: Registered repos auto-discover `.planning/`, `docs/`, and `README.md` by convention
- [ ] **SRC-06**: User can add/remove sources from the web UI (not just CLI)

### Navigation

- [x] **NAV-01**: File tree sidebar shows directory structure of the active source
- [x] **NAV-02**: File tree is collapsible/expandable for nested directories
- [x] **NAV-03**: Repo switcher (dropdown) allows jumping between registered sources
- [ ] **NAV-04**: Relative markdown links resolve correctly within a source
- [ ] **NAV-05**: Heading anchors are auto-generated and clickable
- [ ] **NAV-06**: Inline table of contents generated per document from headings

### Rendering

- [x] **REND-01**: Mermaid fenced code blocks render as diagrams
- [x] **REND-02**: Readable default typography with max-width prose container

### Design

- [x] **DSGN-01**: Minimalist, developer-centric UI layout (sidebar + content pane)
- [x] **DSGN-02**: Dark default theme suitable for developer use

### GSD Dashboard

- [ ] **DASH-01**: Dashboard landing page shows project cards for all registered sources with GSD planning artifacts
- [ ] **DASH-02**: Each project card displays progress percentage, editorial summary of active work (from STATE.md), and quick-links to key files (PROJECT.md, STATE.md, ROADMAP.md)
- [ ] **DASH-03**: Project detail page shows horizontal phase timeline with completed/in-progress/pending status
- [ ] **DASH-04**: Clicking a phase in the timeline shows that phase's documentation (plans, summaries, research, validation) with rendered content
- [ ] **DASH-05**: Branch-aware progress — for git repos with multiple branches containing `.planning/`, show per-branch milestone progress
- [ ] **DASH-06**: Non-GSD sources (no `.planning/STATE.md`) appear on dashboard with graceful fallback to file browser

### Distribution

- [ ] **DIST-01**: Installable and runnable via `npx gsd-browser` with zero prior install
- [ ] **DIST-02**: Published to npm as a public package

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Appearance

- **THME-01**: Catppuccin theme variants (Mocha, Latte, Frappe, Macchiato) with switcher
- **THME-02**: Additional terminal palettes (Solarized, One Dark, Nord)

### Source Management

- **SRC-07**: Explicit custom path registration beyond conventions (`--extra-path`)
- **SRC-08**: Git worktree awareness and support

### Polish

- **POLSH-01**: Copy-to-clipboard button on code blocks
- **POLSH-02**: Keyboard navigation shortcuts
- **POLSH-03**: Open-in-editor integration (`$EDITOR`)
- **POLSH-04**: Per-directory grep-based search

## Out of Scope

| Feature | Reason |
|---------|--------|
| File editing / write-back | Read-only tool; breaks trust model when agents write same files |
| Live reload / file watching | Fresh-on-request is sufficient; adds WebSocket complexity |
| Obsidian integration | Different problem — vault curation vs. live artifact browsing |
| Authentication / multi-user | Personal developer tool on localhost |
| Mobile-responsive layout | Desktop browser tool for developers |
| Plugin / extension system | Maintenance burden; bake in what matters, defer the rest |
| Full-text cross-repo search | Index staleness with active agent writes; defer to v2 |
| TUI (terminal UI) mode | Different product; browser UI is the value proposition; consider as separate tool in future |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SERV-01 | Phase 6 | Pending |
| SERV-02 | Phase 2 | Complete |
| SERV-03 | Phase 2 | Complete |
| SERV-04 | Phase 1 | Complete |
| SERV-05 | Phase 1 | Complete |
| SERV-06 | Phase 1 | Complete |
| SERV-07 | Phase 1 | Complete |
| SERV-08 | Phase 1 | Complete |
| SRC-01 | Phase 3 | Complete |
| SRC-02 | Phase 3 | Complete |
| SRC-03 | Phase 3 | Complete |
| SRC-04 | Phase 3 | Complete |
| SRC-05 | Phase 3 | Complete |
| SRC-06 | Phase 3 | Pending |
| NAV-01 | Phase 4 | Complete |
| NAV-02 | Phase 4 | Complete |
| NAV-03 | Phase 4 | Complete |
| NAV-04 | Phase 5 | Pending |
| NAV-05 | Phase 5 | Pending |
| NAV-06 | Phase 5 | Pending |
| REND-01 | Phase 2 | Complete |
| REND-02 | Phase 2 | Complete |
| DSGN-01 | Phase 4 | Complete |
| DSGN-02 | Phase 4 | Complete |
| DASH-01 | Phase 4.5 | Pending |
| DASH-02 | Phase 4.5 | Pending |
| DASH-03 | Phase 4.5 | Pending |
| DASH-04 | Phase 4.5 | Pending |
| DASH-05 | Phase 4.5 | Pending |
| DASH-06 | Phase 4.5 | Pending |
| DIST-01 | Phase 6 | Pending |
| DIST-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
