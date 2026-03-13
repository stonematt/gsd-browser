# gsd-browser

## What This Is

A lightweight local markdown server that lets developers browse the living documentation that AI agents and tools continuously create across their repos. Point it at repos, register document sources, and get a beautiful file-tree-driven UI to navigate `.planning/`, `docs/`, and other markdown-heavy directories — always serving the current file from disk, never a stale cache.

## Core Value

Instantly browse and read the markdown artifacts that agents are actively writing, across multiple repos, without leaving the browser.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Local HTTP server that renders markdown files from registered repos
- [ ] Register/unregister document sources (repos or specific paths) with persistence
- [ ] Convention-based auto-discovery of `.planning/`, `docs/`, `README.md` in registered repos
- [ ] Explicit custom path registration beyond conventions
- [ ] File tree sidebar navigation for the active repo
- [ ] Repo switcher (dropdown/hamburger) to jump between registered sources
- [ ] Directory traversal — navigate up and down folder structures within a source
- [ ] Always serve fresh file content from disk (no caching)
- [ ] Themable UI with popular terminal palettes (Catppuccin, etc.)
- [ ] Minimalist, pragmatic, developer-centric design
- [ ] npx-able — `npx gsd-browser` with zero install

### Out of Scope

- File editing or write-back — this is read-only
- File watching / live-reload / WebSocket push — just serve fresh on request
- Obsidian integration — different problem, different tool
- Search across repos — keep it simple for v1
- Authentication or multi-user — personal developer tool
- Mobile-responsive design — desktop browser tool

## Context

- GSD (`get-shit-done-cc`) is a Claude Code plugin that creates rich `.planning/` artifact trees — PROJECT.md, ROADMAP.md, STATE.md, phase plans, research docs, etc. These are actively written and updated during development.
- Most personal repos also have a `docs/` directory with relevant documentation.
- Existing tools like `markserv` exist but don't handle multi-repo source registration or convention-based discovery.
- The user uses Obsidian for knowledge management but considers this a different problem — viewing live/active files vs. curating a vault.
- GSD is Node.js (distributed as `.cjs` via npm/npx), so this tool should be a natural sibling in that ecosystem.
- Intended to be public/open-source, potentially contributable back to the GSD project.

## Constraints

- **Tech stack**: Node.js, npx-distributable — must feel like a sibling to GSD
- **Simplicity**: Single command to start, minimal config, convention over configuration
- **Read-only**: Never modify source files
- **Fresh reads**: Every page load reads from disk — no file content caching

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + npx distribution | Match GSD ecosystem, zero-install UX | — Pending |
| Convention-based discovery + explicit paths | Balance zero-config experience with flexibility | — Pending |
| Themable with terminal palettes | Developer audience is opinionated about aesthetics | — Pending |
| No live-reload/file-watching | Simplicity — fresh-on-request is sufficient | — Pending |
| Source registration with persistence | Solves multi-repo access and permission issues | — Pending |

---
*Last updated: 2026-03-13 after initialization*
