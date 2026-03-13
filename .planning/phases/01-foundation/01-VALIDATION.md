---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (no install required) |
| **Config file** | None — use package.json `"test"` script |
| **Quick run command** | `node --test test/server.test.js` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/server.test.js`
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SERV-06 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SERV-04 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SERV-08 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | SERV-05 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | SERV-05 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | SERV-07 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-07 | 01 | 1 | SERV-07 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 01-01-08 | 01 | 1 | SERV-07 | unit | `node --test test/filesystem.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server.test.js` — integration tests covering SERV-04, SERV-05, SERV-06, SERV-07, SERV-08
- [ ] `test/filesystem.test.js` — unit tests for path traversal validation (`isPathAllowed()`)

*No framework install needed — `node:test` is built into Node.js >= 20*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
