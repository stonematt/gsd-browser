# Pitfalls Research

**Domain:** Local markdown server / npx-distributable developer documentation browser
**Researched:** 2026-03-13
**Confidence:** HIGH (path traversal, XSS, npx mechanics) / MEDIUM (UX patterns, config persistence)

---

## Critical Pitfalls

### Pitfall 1: Path Traversal Out of Registered Source Roots

**What goes wrong:**
A file request like `GET /files?path=../../etc/passwd` or a URL with encoded sequences (`%2e%2e/`) escapes the registered source directory and serves arbitrary files from the host system. This is not hypothetical — CVE-2023-26111 (node-static), CVE-2021-23797 (http-server-node), and multiple 2025 Node.js CVEs demonstrate this pattern hitting local file servers repeatedly.

**Why it happens:**
Developers use `path.normalize()` or `path.join()` and assume that is sufficient. It is not. `path.normalize()` resolves `..` sequences but does not verify the result is inside the allowed root. On Windows, legacy device names (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9) bypass `path.normalize` and `path.join` entirely — documented in CVE-2025-27210 and CVE-2025-23084.

**How to avoid:**
Use `path.resolve()` to get the absolute real path, then `fs.realpath()` to resolve symlinks, then assert the result starts with `path.resolve(registeredRoot)`. All three steps are required. Example defense-in-depth:
```javascript
const realBase = await fs.promises.realpath(registeredRoot);
const realTarget = await fs.promises.realpath(path.resolve(registeredRoot, requestedRelativePath));
if (!realTarget.startsWith(realBase + path.sep)) {
  return res.status(403).send('Forbidden');
}
```

**Warning signs:**
- File serving uses only `path.join` or `path.normalize` without a boundary check
- Test: request `GET /file?path=../../../etc/hosts` — if it returns content, you are vulnerable
- Symlinks inside registered directories are not resolved before the boundary check

**Phase to address:** Foundation / core server phase (before any UI work)

---

### Pitfall 2: Markdown XSS via Unsanitized HTML Output

**What goes wrong:**
A markdown file in a registered repo contains `<script>alert('xss')</script>` or a `javascript:` URL in a link. The server renders it directly to HTML and serves it, executing arbitrary JavaScript in the developer's browser. CVE-2025-24981 (Nuxt MDC), multiple marked/showdown vulnerabilities, and an active 2025 CTF exploit all confirm this is real.

**Why it happens:**
Most markdown parsers (marked, showdown) do NOT sanitize HTML by default. Developers assume local tool = trusted content = sanitization unnecessary. But the developer is often browsing repos they just cloned or repos where AI agents are writing files — adversarial content can arrive via that pipeline.

**How to avoid:**
Use `markdown-it` (escapes special characters by default, not vulnerable to the basic HTML injection attack) or configure `marked` with a custom sanitizer. Pair with a Content Security Policy header:
```
Content-Security-Policy: default-src 'self'; script-src 'none'
```
This is a local tool, so a strict CSP costs nothing and blocks the entire attack class regardless of parser choice.

**Warning signs:**
- Markdown parser choice is made without reviewing its XSS stance
- No Content-Security-Policy header in server responses
- Test: create a `.md` file with `<script>document.title='XSS'</script>` and load it — if the title changes, the tool is vulnerable

**Phase to address:** Foundation / core server phase, alongside markdown rendering implementation

---

### Pitfall 3: npx Version Staleness — Users Run Old Code Silently

**What goes wrong:**
A developer runs `npx gsd-browser` after a bug fix release. npx serves the cached version from `~/.npm/_npx/` without any indication. The bug appears fixed to you but not to users. This is a documented, open npm/cli bug with multiple GitHub issues still unresolved in 2025-2026.

**Why it happens:**
npx caches downloads in `~/.npm/_npx/`. When a tagged package (not `@latest`) is already cached, npx does not re-check the registry before using it. Users who run `npx gsd-browser` get the cached version. npm has confirmed inconsistent behavior: sometimes it checks, sometimes it doesn't, depending on npm version, tag vs semver syntax, and network conditions.

**How to avoid:**
- Document that users should run `npx gsd-browser@latest` to guarantee the latest version
- Print the version on startup: `gsd-browser v1.2.3 — run \`npx gsd-browser@latest\` to upgrade`
- Check `npm dist-tag` at startup against the running version and print a notice if behind (non-blocking, best-effort)
- Use a clean package name so users can reason about what they installed

**Warning signs:**
- No version printed at startup
- No upgrade notice mechanism
- Docs show only `npx gsd-browser` without the `@latest` variant
- Users reporting bugs that you've already fixed

**Phase to address:** Distribution / packaging phase

---

### Pitfall 4: Server Binding to 0.0.0.0 Instead of 127.0.0.1

**What goes wrong:**
The server binds to all interfaces (`0.0.0.0`) by default, exposing all registered repos (including sensitive `.planning/` artifacts, API keys in docs, private code) to any device on the local network — coworkers, coffee shop neighbors, or a SSID-shared mobile hotspot.

**Why it happens:**
Express and Node.js `http.createServer().listen(port)` default to `0.0.0.0`. This is the right default for web applications, wrong default for a personal developer tool. Developers copy examples from web app tutorials without adjusting the bind address.

**How to avoid:**
Always default to `127.0.0.1` (localhost-only). Add a `--host` flag if users explicitly need LAN access. Never make LAN access the out-of-the-box behavior for a tool serving local repo content.
```javascript
server.listen(port, '127.0.0.1', () => { ... });
```

**Warning signs:**
- `listen(port)` with no host argument anywhere in server code
- No test verifying requests from a non-localhost address are refused

**Phase to address:** Foundation / core server phase

---

### Pitfall 5: Config File Stored in CWD — Breaks npx Invocation Pattern

**What goes wrong:**
Registered sources (repos) are stored in a config file at `./gsd-browser.json` or `./.gsd-browser`. When run as `npx gsd-browser` from different directories, each invocation creates a separate config with no shared state. Users register repos in one directory and find them gone when they next run the tool from their home directory.

**Why it happens:**
Storing config next to the executable or in CWD is the first thing developers try. It works for project-scoped tools but fails for personal tools that users invoke from anywhere.

**How to avoid:**
Store config in a user-scoped persistent location. Use the `env-paths` npm package for cross-platform correct paths:
- macOS: `~/Library/Preferences/gsd-browser/`
- Linux: `~/.config/gsd-browser/` (XDG_CONFIG_HOME)
- Windows: `%APPDATA%\gsd-browser\`

Do not implement XDG manually — macOS does not follow XDG. The `env-paths` package handles all three platforms correctly.

**Warning signs:**
- Config path is `process.cwd() + '/config.json'` or `__dirname + '/config.json'`
- Running the tool from a different directory loses registered sources
- Config location is undocumented in startup output

**Phase to address:** Source registration / config phase (phase 2 or whenever persistence is introduced)

---

### Pitfall 6: npm Package Name Not Claimed Before Development Starts

**What goes wrong:**
You build the tool, go to publish it as `gsd-browser`, and the name is taken — either by an unrelated project or by a typosquatter who registered it speculatively. You ship under a different name, the tool never reaches its intended audience via `npx gsd-browser`, and all documentation is wrong.

**Why it happens:**
Developers focus on building before claiming the package name. The 2025 npm supply chain environment makes this riskier than ever — typosquatters actively register plausible CLI tool names. The aikido.dev research shows thousands of unclaimed-but-expected package names exist.

**How to avoid:**
Register the package name on npmjs.com before writing a line of code. Publish a stub `0.0.1` with a README if necessary. This takes 5 minutes and costs nothing. Check `npm view gsd-browser` — if it 404s, claim it immediately.

**Warning signs:**
- `npm view gsd-browser` returns a 404 and the package hasn't been claimed yet
- Development is past MVP and the name hasn't been registered

**Phase to address:** Pre-development / project setup (before any other phase)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip `fs.realpath()` in path validation | Simpler code | Symlink traversal vulnerability, security CVE | Never |
| Store config in CWD | Works for first demo | Broken experience for all users who use npx | Never |
| Bind to `0.0.0.0` | Works from other devices | Exposes private docs on shared networks | Only with explicit `--host` flag |
| Use `marked` without sanitizer | Renders rich markdown | XSS from any file with HTML content | Never (add CSP at minimum) |
| No version print at startup | Cleaner output | Silent stale-version bugs, hard to report issues | Never |
| Hardcode port 3000, no conflict handling | Simple first pass | EADDRINUSE crashes with no explanation | MVP only — add fallback before publish |
| Skip CSP headers | Faster to skip | XSS attack surface even with a good markdown parser | Never — CSP is free |
| Relative paths in registered source list | Easy to write | Breaks when tool is invoked from different CWD | Never — always resolve to absolute on registration |

---

## Integration Gotchas

Common mistakes when connecting to external services or system components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| File system (multi-repo) | Store relative paths in config | Resolve to absolute paths at registration time, store absolute paths |
| File system (symlinks) | Trust `path.resolve()` alone | Use `fs.realpath()` after `path.resolve()` to follow symlinks |
| npm registry (npx) | Assume `npx pkg` always fetches latest | Document `npx pkg@latest` and print version at startup |
| Browser (markdown HTML) | Serve raw markdown-to-HTML without headers | Always set `Content-Security-Policy: script-src 'none'` on markdown responses |
| OS config dirs | Use XDG on all platforms | Use `env-paths` package — macOS uses `~/Library/Preferences`, not `~/.config` |
| Port binding | Use `listen(port)` defaults | Explicitly pass `'127.0.0.1'` as host to all `listen()` calls |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous `fs.readFileSync()` in request handler | Fine with one user, blocks event loop under any concurrency | Use `fs.promises.readFile()` throughout | Any two simultaneous requests |
| Directory tree built on every page request | Slow sidebar rendering for large repos | Cache tree structure with TTL or on-demand lazy load per directory level | Repos with 500+ files in `.planning/` |
| No `fs.realpath()` caching for registered sources | Repeated syscalls per request | Cache resolved base paths at startup, re-resolve only on config change | Every request for every file |
| Synchronous config file read at startup | Imperceptible delay now | Freezes startup on slow network drives or unusual mount points | Network-mounted home directories |

Note: This tool is explicitly scoped to a personal developer tool with one user at a time. Performance traps matter only for event loop blocking and startup time, not for concurrency or throughput.

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Serving files outside registered roots | Arbitrary file read of any file the OS user can access | `path.resolve()` + `fs.realpath()` + startsWith check before every file read |
| No Content-Security-Policy header | XSS from markdown files with embedded HTML/scripts | Add `Content-Security-Policy: default-src 'self'; script-src 'none'` to all responses |
| Binding to 0.0.0.0 | Private docs exposed to local network | Default to `127.0.0.1`; require explicit opt-in for LAN access |
| Rendering markdown with `marked` default settings | `<script>` tags in .md files execute in browser | Use `markdown-it` or configure `marked` sanitizer; CSP as backup |
| Directory listing beyond registered sources | User can enumerate full file system tree | Scope all directory listing APIs to registered source roots only |
| Exposing config file path via API | Reveals home directory structure | Config path is server-internal only; never expose it via HTTP response |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent startup with no URL printed | User doesn't know where to open the browser | Always print `Listening at http://127.0.0.1:PORT` on startup |
| Port conflict crashes with raw EADDRINUSE | User sees Node.js stack trace, doesn't know what to do | Catch EADDRINUSE, print "Port 3000 is in use — try --port 3001" |
| File tree shows all files including binaries | Confusing noise in sidebar | Filter to `.md`, `.txt`, and optionally configurable extensions |
| No indication which repo is active | User loses context after switching | Show active repo name prominently in header or page title |
| Registered source paths stored as user typed them | Relative paths break on next invocation | Resolve and display absolute paths; show them in `gsd-browser list` output |
| Navigating to a non-.md file returns raw content with no styling | Jarring experience | Show a "not a markdown file" page with the file tree still visible |
| No feedback when registering a path that doesn't exist | Silent failure or cryptic error | Validate path exists at registration time, print clear error |
| Browser cache serves stale page after file was updated by agent | Developer doesn't see the latest agent output | Set `Cache-Control: no-store` on markdown responses; this is the core value prop |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Path security:** File serving works for normal paths — verify it rejects `../../../etc/passwd`, URL-encoded `%2e%2e`, and symlinks pointing outside roots
- [ ] **Config persistence:** Sources registered in one terminal session appear when tool is started from a different directory
- [ ] **npx experience:** Running `npx gsd-browser` (not `node index.js`) actually works — shebang is correct, bin entry in package.json is correct, file is executable
- [ ] **Fresh reads:** After an AI agent updates a file, refreshing the browser shows the new content — no ETag or Cache-Control header is caching the old version
- [ ] **Port conflict:** Starting a second instance shows a human-readable error, not a Node.js stack trace
- [ ] **CSP header:** Browser devtools show `Content-Security-Policy` on markdown responses — verify with curl or Network tab
- [ ] **Cross-platform config:** Config file is written to and read from the correct OS-specific path on macOS, Linux, and Windows (not CWD, not `__dirname`)
- [ ] **Source root enforcement:** File tree sidebar only shows files inside the registered source root, not the parent directories

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Path traversal vulnerability discovered post-publish | HIGH | Immediate patch release; file CVE; notify via npm deprecation message on vulnerable versions |
| Wrong package name (name taken) | HIGH | Negotiate transfer via npm support, or rename and update all docs; scoped name `@stonematt/gsd-browser` as fallback |
| Config in CWD for published version | MEDIUM | Add migration: detect old config, copy to new location, delete old, print migration notice |
| npx version staleness complaints | LOW | Add startup version check + upgrade notice; update docs to recommend `@latest` |
| Port conflict UX discovered | LOW | Add EADDRINUSE handler with helpful message; patch release |
| Markdown XSS discovered | MEDIUM | Add CSP header (immediate mitigation without code change to parser); then fix parser config |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Path traversal out of registered roots | Phase 1: Core server | Integration test: `GET` with `../` paths returns 403, not file content |
| Markdown XSS | Phase 1: Core server | Check: `curl -I` on any `.md` response shows CSP header; test: script tags in .md don't execute |
| Server binds to 0.0.0.0 | Phase 1: Core server | Test: request from non-localhost address is refused by default |
| Config stored in CWD | Phase 2: Source registration | Test: register source, restart from different directory, source still listed |
| npm package name unclaimed | Pre-Phase 1: Project setup | Check: `npm view gsd-browser` returns package metadata, not 404 |
| npx version staleness | Phase 4+: Distribution | Verify: startup prints version; docs show `@latest` usage |
| Port conflict UX | Phase 1: Core server | Test: start two instances; second prints human-readable error |
| Browser caches stale markdown | Phase 1: Core server | Test: update file, refresh browser, see new content (no hard refresh needed) |
| Relative paths in config break | Phase 2: Source registration | Test: register with relative path, verify absolute path is stored |

---

## Sources

- [npm/cli issue: npx not getting latest version](https://github.com/npm/rfcs/issues/700) — version caching behavior
- [npm/cli issue: npx downloads same version multiple times](https://github.com/npm/cli/issues/6450) — caching confusion
- [CVE-2025-27210: Node.js path traversal via Windows device names](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows) — path normalization insufficient
- [Node.js path traversal prevention guide](https://nodejsdesignpatterns.com/blog/nodejs-path-traversal-security/) — `realpath()` required
- [Snyk: Directory Traversal in node-static CVE-2023-26111](https://security.snyk.io/vuln/SNYK-JS-NODESTATIC-3149928) — real-world local server vulnerability
- [Markdown XSS via showdown wiki](https://github.com/showdownjs/showdown/wiki/Markdown's-XSS-Vulnerability-(and-how-to-mitigate-it)) — XSS from markdown parsers
- [CVE-2025-24981: XSS in Markdown library](https://thesecmaster.com/blog/how-to-fix-cve-2025-24981-mitigating-xss-vulnerability-in-markdown-library-for-we) — recent 2025 parser XSS
- [aikido.dev: npx confusion and unclaimed package names](https://www.aikido.dev/blog/npx-confusion-unclaimed-package-names) — name squatting risk
- [Typosquatting in package managers 2025](https://nesbitt.io/2025/12/17/typosquatting-in-package-managers.html) — supply chain context
- [xdg-basedir npm package](https://github.com/sindresorhus/xdg-basedir) — cross-platform config path handling
- [Node.js Permission Model symlink bypass](https://markaicode.com/nodejs-22-permission-model-workarounds/) — fs.realpath() required for symlinks
- [EADDRINUSE deep dive](https://iifx.dev/en/articles/17427427) — port conflict handling patterns
- [Deepgram: Creating an npx command](https://deepgram.com/learn/npx-script) — shebang and bin entry point requirements
- [MDN: Cache-Control no-store](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — fresh file read HTTP header

---

*Pitfalls research for: local markdown server / npx-distributable developer documentation browser (gsd-browser)*
*Researched: 2026-03-13*
