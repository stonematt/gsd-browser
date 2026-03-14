---
phase: 3
slug: source-registration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — `"test": "node --test test/"` in package.json |
| **Quick run command** | `node --test test/sources.test.js` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/sources.test.js`
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | SRC-01 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | SRC-01 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | SRC-01 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | SRC-02 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | SRC-02 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 1 | SRC-03 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 1 | SRC-04 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-04-02 | 04 | 1 | SRC-04 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 1 | SRC-05 | unit | `node --test test/sources.test.js` | ❌ W0 | ⬜ pending |
| 3-05-02 | 05 | 1 | SRC-05 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 3-06-01 | 06 | 1 | SRC-06 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 3-06-02 | 06 | 1 | SRC-06 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 3-06-03 | 06 | 1 | SRC-06 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 3-06-04 | 06 | 1 | SRC-06 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/sources.test.js` — stubs for SRC-01 through SRC-05 unit tests; shared temp-dir fixture
- [ ] `src/sources.js` — module being tested (created in Wave 1, tested from Wave 0 scaffolding)

*Existing test infrastructure: node:test, temp-dir fixtures via `os.tmpdir()` + `fs.mkdtemp()`, `fastify.inject()` for server tests — all patterns established in Phase 1/2 tests. No new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI output formatting is visually clean | SRC-03 | Aesthetic judgment | Run `gsd-browser list` with 2+ sources, verify aligned columns |
| `/sources` page usable | SRC-06 | UI interaction | Open browser to `/sources`, add/remove a source |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
