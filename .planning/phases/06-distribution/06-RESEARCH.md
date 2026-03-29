# Phase 6: Distribution - Research

**Researched:** 2026-03-29
**Domain:** npm packaging, npx zero-install CLI distribution, browser auto-open, startup UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**First-run experience**
- Check CWD for conventions (.planning/, docs/, README.md) when no sources are registered
- If conventions found: auto-register CWD (persist to config, same as `gsd-browser add .`) and start serving
- Auto-open browser on first-run specifically (even before deciding general auto-open)
- Banner should note "(auto-registered)" for transparency
- If CWD has no conventions AND no sources registered: show guided help message with example commands and offer to open the sources management page
- Do NOT offer to add CWD if it has no discoverable conventions — just show help

**Browser auto-open**
- Default behavior: always open browser on start
- `--no-open` flag to suppress
- Persistent config option in user config file to flip the default either way (e.g., `{ "open": false }` to default to no-open)
- Config precedence: CLI flag > config file > default (true)

**Startup banner**
- Clean one-liner format: `gsd-browser v{version} — http://127.0.0.1:{port}`
- Sources listed below with name and discovered conventions: `  my-project: .planning/, docs/, README.md`
- Auto-registered sources noted with "(auto-registered)" suffix
- Version number read from package.json (already implemented in `--version` flag)

**Package metadata**
- Publish as version 0.9.0 — "almost 1.0, get feedback first"
- `files` field: ship only `src/`, `bin/`, `public/`, `README.md`, `LICENSE`
- Add `repository`, `keywords`, `author`, `homepage` fields to package.json
- npm package name: `gsd-browser` (confirmed unclaimed — verified 2026-03-29: `npm view gsd-browser` returns 404)

**README**
- Detailed project README following GitHub best practices
- Set context: what GSD is, why this tool exists, relationship to get-shit-done-cc
- Include dashboard screenshot
- CLI reference with all commands and flags
- Quick start + detailed usage sections

### Claude's Discretion
- Whether to use `open` npm package or `child_process` for browser opening
- Exact wording of guided help message and sources page offer
- README structure and section ordering
- Keywords list for npm
- Whether a LICENSE file needs to be created (MIT declared in package.json)
- Any `.npmignore` vs `files` field approach

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-01 | Local HTTP server starts with `npx gsd-browser` and opens browser automatically | Covered by: npx zero-install mechanics (bin + shebang already correct), browser auto-open via `open` package or `child_process`, startup banner update |
| DIST-01 | Installable and runnable via `npx gsd-browser` with zero prior install | Covered by: `files` field scoping, `bin` field already correct, package.json metadata completeness, `npm publish --access public` |
| DIST-02 | Published to npm as a public package | Covered by: npm publish workflow, version bump to 0.9.0, `--access public` flag (not needed for unscoped packages but good to know), package metadata fields |
</phase_requirements>

---

## Summary

Phase 6 is a packaging and polish phase with no new server functionality. The core mechanics are mostly in place: `bin/gsd-browser.cjs` already has the correct shebang (`#!/usr/bin/env node`), `package.json` already has the `bin` field configured, and the server already supports an `open` option. The work is in closing the gaps: adding the `files` field to prevent publishing `.planning/`, `.claude/`, and other dev artifacts; bumping the version to 0.9.0; adding missing package.json metadata fields; implementing first-run CWD detection; changing the auto-open default from opt-in to opt-in-by-default-with-config; updating the startup banner format; and writing the README.

The `open` npm package is ESM-only at v11.0.0 (type: module). The codebase is CJS. The existing code already handles this correctly with a dynamic `import()` pattern and silent failure. The recommendation is to keep this pattern and add `open` as a formal dependency rather than treating it as optional. The alternative — rolling `child_process.exec` with platform detection — is a maintenance burden without benefit for a CLI tool that only runs on macOS/Linux/Windows developer machines.

**Primary recommendation:** Add `open` as a dependency, lock in the `files` field immediately (current `npm pack --dry-run` shows `.planning/`, `.claude/settings.local.json`, and all research artifacts would ship without it — a critical packaging bug), and implement the three behavioral changes in `bin/gsd-browser.cjs` and `src/server.js`.

---

## Standard Stack

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| minimist | ^1.2.8 | CLI argument parsing | Already used; handles `--no-open` boolean natively |
| node:fs/promises | built-in | Config read/write | Used in sources.js; no new dependency needed |
| node:os | built-in | XDG path calculation | Already used in sources.js |

### New Dependency
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| open | ^11.0.0 | Cross-platform browser open | ESM-only; CJS dynamic import pattern already established; handles macOS/Linux/Windows |

### Existing Partial Use
The `open` package is already dynamically imported in `src/server.js` lines 1143-1150 but is NOT listed in `package.json` dependencies. This means it currently works if the user happens to have it, but silently fails otherwise. It must be added as a proper dependency for `npx` zero-install to work reliably.

**Installation:**
```bash
npm install open
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `open` npm package | `child_process.exec` with platform switch | Hand-rolling requires detecting `open` (macOS), `xdg-open` (Linux), `start` (Windows), handling WSL edge cases, and managing detached processes. `open` package handles all of this. No benefit to custom implementation for a developer tool. |
| `files` field in package.json | `.npmignore` | Both work. `files` is a whitelist (safer — only lists what ships), `.npmignore` is a blacklist (easier to forget to exclude new files). Use `files`. |

---

## Architecture Patterns

### npx Zero-Install Mechanics

The `bin` field in `package.json` is already correct:
```json
{
  "bin": { "gsd-browser": "bin/gsd-browser.cjs" }
}
```

When a user runs `npx gsd-browser`:
1. npx checks local `node_modules/.bin/` — not found
2. npx checks global npm install — not found
3. npx downloads from npm registry to a temp cache
4. npx executes the file pointed to by the `bin.gsd-browser` field
5. The `#!/usr/bin/env node` shebang on `bin/gsd-browser.cjs` triggers Node.js execution

This is already wired correctly. The remaining work is ensuring the package is published cleanly.

### Pattern 1: `files` Field Whitelist

**What:** Explicitly lists what ships in the npm tarball. Without it, npm uses `.gitignore` as a fallback (confirmed by `npm pack --dry-run` output, which showed `.planning/`, `.claude/settings.local.json`, and all research/planning artifacts being included).

**Critical finding:** Running `npm pack --dry-run` from the project root confirmed that without a `files` field, the following sensitive/irrelevant content would publish:
- `.claude/settings.local.json` (API settings)
- `.planning/` (entire planning directory — 100+ files)
- `test/` (test fixtures)
- `bin/dev-server` (dev tooling)

**Add immediately:**
```json
{
  "files": ["src/", "bin/", "public/", "README.md", "LICENSE"]
}
```

Note: `package.json` and `LICENSE` are always included by npm regardless of `files` field. Including `README.md` explicitly is still correct practice.

### Pattern 2: First-Run CWD Detection

**Location:** `bin/gsd-browser.cjs`, lines 118-143 (the `else` branch that starts the server)

**Logic flow:**
```
1. loadConfig() → no sources registered?
   YES:
     a. discoverConventions(process.cwd())
        → conventions found? auto-register CWD, set autoRegistered=true
        → no conventions? show guided help, offer sources page, exit
   NO:
     Continue with existing source enrichment
```

The existing `addSource()` and `discoverConventions()` functions in `src/sources.js` cover all the persistence and discovery logic. No new functions needed.

**Guided help message (discretion area):**
```
No sources registered and no GSD conventions found in /path/to/cwd.

To get started:
  gsd-browser add /path/to/your/project   Add a specific project
  gsd-browser add .                       Add current directory

Or open the sources management page:
  gsd-browser --port 4242                 Start server, open sources page at http://127.0.0.1:4242/sources
```

### Pattern 3: Auto-Open Default and Config

**Current behavior:** `options.open` comes from CLI `--open` flag; default is false (opt-in).
**Target behavior:** Default true, `--no-open` suppresses, config file key `open: false` persists suppression.

`minimist` natively handles `--no-open` with the `boolean: ['open']` option already in place. When user passes `--no-open`, `args.open` is `false`. When user passes `--open`, `args.open` is `true`. When neither is passed, `args.open` is `false` (current default).

**New config precedence logic in `bin/gsd-browser.cjs`:**
```javascript
// Config precedence: CLI flag > config file > default (true)
let shouldOpen = true; // default
if (config.open !== undefined) shouldOpen = config.open; // config file
if ('open' in args && process.argv.includes('--no-open')) shouldOpen = false;
else if (args.open === true) shouldOpen = true;
```

Wait — minimist with `boolean: ['open']` and default unset: `args.open` will be `false` when neither `--open` nor `--no-open` is passed, which makes it impossible to distinguish "user said --no-open" from "user said nothing". The correct pattern is to check `process.argv` directly or use a different approach:

**Correct approach:** Check `process.argv` for explicit `--no-open` or `--open` presence:
```javascript
const explicitOpen = process.argv.includes('--open');
const explicitNoOpen = process.argv.includes('--no-open');
const configOpen = config.open; // undefined if not set

let shouldOpen;
if (explicitNoOpen) shouldOpen = false;
else if (explicitOpen) shouldOpen = true;
else if (configOpen !== undefined) shouldOpen = configOpen;
else shouldOpen = true; // default: open
```

**Config persistence:** The `open` preference lives in the existing config file (`~/.config/gsd-browser/sources.json`). The `saveConfig` / `loadConfig` functions in `src/sources.js` already read/write that file. Add `config.open` to the config object shape — `loadConfig()` returns the full JSON, so it will naturally include an `open` key if present.

### Pattern 4: Startup Banner Update

**Current (src/server.js ~line 1134):**
```javascript
process.stdout.write(`gsd-browser serving ${availableSources[0].path} at http://127.0.0.1:${actualPort}\n`);
```

**Target:**
```
gsd-browser v0.9.0 — http://127.0.0.1:4242
  my-project: .planning/, docs/, README.md (auto-registered)
  other-project: docs/
```

**Implementation:** `pkg.version` is already imported in `bin/gsd-browser.cjs` but the banner is generated in `src/server.js`. Pass version as an option to `start()`, or read `require('../package.json').version` in server.js directly.

### Pattern 5: open Package ESM-in-CJS Dynamic Import

The existing pattern in `src/server.js` is correct for ESM-only packages from CJS:
```javascript
// Already implemented — keep this pattern
const open = await import('open');
await open.default(`http://127.0.0.1:${actualPort}`);
```

This works because `open` v11 exports `default` as the primary function. The `await import()` wraps the ESM module in a CJS-compatible promise.

### Anti-Patterns to Avoid

- **Publishing without `files` field:** Current `npm pack --dry-run` shows 100+ planning/dev files would ship. Must add `files` before `npm publish`.
- **Using `args.open` boolean to distinguish "not set" from "explicitly false":** minimist defaults unset booleans to `false`. Must check `process.argv` directly for precedence logic.
- **Adding `open` to `devDependencies`:** It's a runtime dependency — end users running `npx gsd-browser` need it. Must be in `dependencies`.
- **Skipping `npm pack --dry-run` before publish:** Always verify tarball contents before first publish.
- **Publishing with `--access restricted` or without `--access public` for scoped packages:** Not needed here (package is unscoped), but for an unscoped package, default access is already public.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform browser open | `child_process.exec` with `open`/`xdg-open`/`start` switch | `open` v11 | WSL detection, browser app selection, detached process handling, private mode support |
| npm tarball scoping | `.npmignore` blacklist | `files` whitelist in package.json | Blacklists silently include new files you forget to exclude; whitelist is explicit |
| ESM module import from CJS | eval tricks, bundler | `await import('open')` dynamic import | Node.js native, stable since Node 12, already established in codebase |

**Key insight:** The `open` package handles the macOS/Linux/Windows platform branching, `open` vs `xdg-open` vs `start`, WSL detection, and subprocess detachment. These edge cases are not obvious and have caused bugs in many projects that hand-rolled this.

---

## Common Pitfalls

### Pitfall 1: Missing `files` Field Ships Dev Artifacts
**What goes wrong:** Publishing without `files` field ships `.planning/`, `.claude/settings.local.json`, `test/`, and all dev documentation to npm — visible at `https://registry.npmjs.org/gsd-browser/-/gsd-browser-0.9.0.tgz`.
**Why it happens:** npm falls back to `.gitignore` when no `.npmignore` or `files` field is present. `.gitignore` is for local dev, not package scoping.
**How to avoid:** Add `files` to `package.json` FIRST, verify with `npm pack --dry-run` before `npm publish`.
**Warning signs:** `npm pack --dry-run` output showing `.planning/`, `.claude/`, or `test/` directories.

### Pitfall 2: `open` Not in `dependencies`
**What goes wrong:** `npx gsd-browser` installs the package but doesn't install `open`. Server starts, but browser never opens. No error message (current code silently ignores the failure).
**Why it happens:** `open` is already dynamically imported in `src/server.js` but was never added to `package.json` `dependencies`.
**How to avoid:** `npm install open` — this adds it to `dependencies` automatically. Verify `package.json` shows `"open": "^11.0.0"` in `dependencies`, not `devDependencies`.
**Warning signs:** Silent failure on browser open, no error in console.

### Pitfall 3: `args.open` Can't Distinguish "Unset" from "Explicitly False"
**What goes wrong:** Logic like `const shouldOpen = args.open ?? true` doesn't work because minimist defaults unset booleans to `false`, not `undefined`. So `args.open` is `false` both when user passes `--no-open` AND when user passes nothing at all.
**Why it happens:** minimist `boolean: ['open']` makes `args.open` always a boolean.
**How to avoid:** Check `process.argv.includes('--no-open')` and `process.argv.includes('--open')` for explicit intent detection.

### Pitfall 4: First Publish of Scoped Package Without `--access public`
**What goes wrong:** Scoped packages (`@org/name`) default to restricted (private). Publishing without `--access public` fails with a payment error.
**Why it happens:** npm defaults scoped packages to restricted access.
**How to avoid:** This package is unscoped (`gsd-browser`, not `@scope/gsd-browser`), so `--access public` is not required. No special flag needed: `npm publish` will publish publicly by default.

### Pitfall 5: VERSION Not Passed to Server Banner
**What goes wrong:** Startup banner shows wrong or hardcoded version string.
**Why it happens:** `pkg.version` is read in `bin/gsd-browser.cjs` but the banner is printed inside `src/server.js` `start()`.
**How to avoid:** Either pass `version` as an option to `start(port, sources, { open, version })` or read `require('../package.json').version` inside `src/server.js` directly. The latter is simpler since `server.js` already has the package root in scope via `__dirname`.

### Pitfall 6: Config `open` Key Conflicts with Config File Shape
**What goes wrong:** Adding `open` preference to config file at `{ "open": false }` but `loadConfig()` returns a config object that includes `sources` array. If the config file only has `{ "open": false }` (no sources), `config.sources` is `undefined` and crashes.
**Why it happens:** `loadConfig()` returns `{ sources: [] }` as fallback when file missing, but reads the file as-is when present. A freshly written config with only `{ "open": false }` would have no `sources` key.
**How to avoid:** `saveConfig()` must always write `{ sources: [...], open: ... }` and `loadConfig()` should default `sources` to `[]` when absent. The current fallback `return { sources: [] }` only applies to ENOENT — need to normalize after parse too.

---

## Code Examples

### First-Run Detection (bin/gsd-browser.cjs, server start branch)
```javascript
// Source: src/sources.js discoverConventions() pattern
const config = await loadConfig();

if (config.sources.length === 0) {
  const cwdConventions = await discoverConventions(process.cwd());
  if (cwdConventions.length > 0) {
    // Auto-register CWD
    const result = await addSource('.', {});
    if (result.ok) {
      config.sources = [result.source];
      // Flag for banner
      result.source._autoRegistered = true;
    }
  } else {
    // No conventions, no sources — show help
    process.stdout.write(
      `No sources registered. No GSD conventions found in ${process.cwd()}.\n\n` +
      `To get started:\n` +
      `  gsd-browser add /path/to/project\n` +
      `  gsd-browser add .               (current directory)\n`
    );
    process.exit(0);
  }
}
```

### Auto-Open Precedence Logic
```javascript
// Distinguish CLI intent from unset (minimist can't do this alone)
const explicitOpen = process.argv.includes('--open');
const explicitNoOpen = process.argv.includes('--no-open');
const configOpen = config.open; // undefined if key absent

let shouldOpen;
if (explicitNoOpen)            shouldOpen = false;
else if (explicitOpen)         shouldOpen = true;
else if (configOpen !== undefined) shouldOpen = configOpen;
else                           shouldOpen = true; // default: always open
```

### Startup Banner (src/server.js start())
```javascript
// Updated banner — version passed via options or read from package.json
const version = options.version || require('../package.json').version;
process.stdout.write(`gsd-browser v${version} — http://127.0.0.1:${actualPort}\n`);
for (const src of availableSources) {
  const conventionStr = src.conventions && src.conventions.length > 0
    ? src.conventions.map(c => c.endsWith('.md') ? c : c + '/').join(', ')
    : 'no conventions';
  const autoTag = src._autoRegistered ? ' (auto-registered)' : '';
  process.stdout.write(`  ${src.name}: ${conventionStr}${autoTag}\n`);
}
```

### package.json `files` Field
```json
{
  "name": "gsd-browser",
  "version": "0.9.0",
  "files": ["src/", "bin/", "public/", "README.md", "LICENSE"],
  "repository": {
    "type": "git",
    "url": "https://github.com/stonematt/gsd-browser"
  },
  "homepage": "https://github.com/stonematt/gsd-browser#readme",
  "author": "Matt Stone",
  "keywords": ["markdown", "gsd", "ai-agents", "browser", "planning", "developer-tools"]
}
```

### npm Publish Workflow
```bash
# Verify tarball contents before publish
npm pack --dry-run

# Check for any surprises (should only show src/, bin/, public/, README.md, package.json)
# Then publish
npm publish

# Verify
npm view gsd-browser
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `open` as optional silent-fail import | `open` as declared dependency | Phase 6 | Reliable browser open for all npx users |
| `--open` opt-in flag | Default open, `--no-open` to suppress | Phase 6 | Better zero-install UX |
| Error exit when no sources | First-run CWD detection + auto-register | Phase 6 | Works out of the box for new users |
| No `files` field (ships everything) | `files` whitelist | Phase 6 | Clean, minimal package on npm |

**Deprecated/outdated:**
- Silent `open` failure pattern: Acceptable for dev builds, but not for a published package where users expect it to just work.
- `.gitignore` as npm exclude fallback: Only useful if you deliberately have no `files` or `.npmignore`. This project should use `files`.

---

## Open Questions

1. **LICENSE file existence**
   - What we know: `package.json` declares `"license": "MIT"` but no `LICENSE` file exists in the repo (git status doesn't show one; `files` field references it).
   - What's unclear: Whether npm requires a physical file or just the `package.json` field.
   - Recommendation: Create a `LICENSE` file with MIT text. npm displays it in the package page, and the `files` field lists it — shipping a missing file silently omits it, but it's better to have the file.

2. **Public/ directory contents**
   - What we know: `files` field includes `public/` per the CONTEXT.md decisions.
   - What's unclear: Does `public/` exist as a real directory in the project, or is this for future static assets?
   - Recommendation: Verify with `ls public/` before publishing; if empty/absent, remove from `files` to avoid npm warning.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node.js >= 18) |
| Config file | none — invoked directly |
| Quick run command | `node --test test/sources.test.js` |
| Full suite command | `node --test test/sources.test.js && node --test test/server.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-01 | `npx gsd-browser` starts server and opens browser | smoke | `node --test test/e2e-smoke.test.js` | ✅ (partial — needs browser-open assertion or manual verification) |
| SERV-01 | First-run CWD auto-register when conventions present | unit | `node --test test/sources.test.js` | ✅ (sources logic exists; new test cases needed) |
| SERV-01 | First-run guided help when no conventions | unit | `node --test test/sources.test.js` | ✅ Wave 0 |
| SERV-01 | `--no-open` suppresses browser | unit | `node --test test/server.test.js` | ✅ Wave 0 |
| SERV-01 | Config file `open: false` persists suppression | unit | `node --test test/sources.test.js` | ✅ Wave 0 |
| SERV-01 | Startup banner format `gsd-browser vX.Y.Z — url` | unit | `node --test test/server.test.js` | ✅ Wave 0 |
| DIST-01 | Package installs cleanly via npx (tarball has correct files) | manual | `npm pack --dry-run` | manual-only |
| DIST-02 | `npm view gsd-browser` returns metadata | manual | `npm view gsd-browser` | manual-only — requires live npm publish |

### Sampling Rate
- **Per task commit:** `node --test test/sources.test.js` (fast, covers config changes)
- **Per wave merge:** `node --test test/sources.test.js && node --test test/server.test.js`
- **Phase gate:** Full suite green + `npm pack --dry-run` output reviewed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/sources.test.js` — add test cases for first-run CWD auto-register and guided help paths (file exists, new test cases needed within it)
- [ ] `test/server.test.js` — add test cases for new banner format and `shouldOpen` logic
- [ ] No framework install needed — `node:test` built-in is already in use

---

## Sources

### Primary (HIGH confidence)
- npm pack --dry-run output (local verification) — confirmed `files` field is missing and dev artifacts ship
- `npm view open version` (live registry check) — open@11.0.0, type: module (ESM-only)
- `npm view gsd-browser` (live registry check) — returns 404, package name is available
- `bin/gsd-browser.cjs` (source code) — confirmed shebang and bin field are correct; `open` dynamic import already exists but not in dependencies
- `src/server.js` lines 1120-1158 (source code) — confirmed banner and open logic integration points
- `src/sources.js` (source code) — confirmed `discoverConventions()`, `addSource()`, `loadConfig()`, `saveConfig()` all exist and are reusable

### Secondary (MEDIUM confidence)
- [npm package.json docs](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/) — `files`, `repository`, `keywords`, `author` fields
- [npx docs](https://docs.npmjs.com/cli/v11/commands/npx/) — zero-install execution flow
- [open package README](https://github.com/sindresorhus/open/blob/main/readme.md) — ESM-only, CJS dynamic import pattern, cross-platform browser opening

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified open@11.0.0 ESM type from live npm registry; existing CJS dynamic import pattern confirmed in source
- Architecture: HIGH — verified from source code (existing integration points match CONTEXT.md line references); npm pack dry-run confirmed `files` field gap
- Pitfalls: HIGH — pitfalls #1, #2, #3, #6 verified against actual code and live `npm pack` output

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (npm CLI stable; `open` package version may advance but ^11.0.0 range covers it)
