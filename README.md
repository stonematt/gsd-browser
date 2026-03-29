# gsd-browser

Browse markdown artifacts that AI agents write, fresh from disk.

<!-- TODO: Add actual screenshot -->
![Dashboard](docs/screenshot-dashboard.png)

## What is this

[GSD (get-shit-done)](https://github.com/stonematt/get-shit-done-cc) is a Claude Code planning framework where AI agents continuously produce structured markdown artifacts — roadmaps, phase plans, research docs, state files — in a `.planning/` directory as they work.

gsd-browser is a companion tool that lets you read those artifacts in a clean browser UI without leaving your workflow. Point it at your repos and get a dashboard showing project progress, phase timelines, and branch-aware milestone state. Every page load reads directly from disk — no caching, no stale content.

## Quick Start

```bash
npx gsd-browser
```

Run in any directory. gsd-browser auto-discovers `.planning/`, `docs/`, and `README.md`. If found, it auto-registers the directory and opens your browser to the dashboard.

## Installation

For a permanent global install:

```bash
npm install -g gsd-browser
```

## Usage

### Start the server

```bash
gsd-browser
```

Starts on port 4242 by default, opens browser automatically. On first run in a directory with GSD conventions, auto-registers the current directory.

### CLI Reference

**Source management**

```bash
# Register a source directory (auto-discovers conventions)
gsd-browser add [path]

# Register with a custom display name
gsd-browser add . --name my-project

# Remove a registered source by name or path
gsd-browser remove <name|path>

# List all registered sources
gsd-browser list
```

**Server options**

```
--port <n>, -p <n>    Port to listen on (default: 4242)
--no-open             Suppress browser auto-open on startup
                      (save permanently: set "open": false in your config)
```

**General**

```
--version, -v         Print version and exit
--help, -h            Show help message
```

## Features

- GFM rendering with syntax highlighting (Shiki) and Mermaid diagrams rendered server-side as SVG
- Multi-project dashboard with phase timeline and progress tracking
- File tree browser with source switching across registered projects
- Fresh-from-disk on every request — no caching, no stale reads
- Convention-based discovery: `.planning/`, `docs/`, `README.md` auto-detected
- Branch-aware GSD progress across git branches
- Dark theme with Catppuccin colors
- Localhost-only with Content-Security-Policy headers (security-first)

## How It Works

Node.js + Fastify serves a single-page application. Markdown files are rendered server-side using markdown-it, Shiki (syntax highlighting), and Mermaid (diagram SVG generation). The frontend is vanilla JavaScript with no build step. Source registration is persisted in a config file under `~/.config/gsd-browser/`.

## Configuration

Config file location: `~/.config/gsd-browser/sources.json`

The config stores registered source paths and the `open` preference (whether to auto-open the browser on startup). You can set `"open": false` to permanently suppress browser auto-open.

## License

[MIT](LICENSE)
