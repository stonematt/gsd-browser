---
phase: 6
slug: distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — uses node --test |
| **Quick run command** | `node --test test/server.test.js` |
| **Full suite command** | `node --test test/server.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/server.test.js`
- **After every plan wave:** Run `node --test test/server.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | DIST-01 | unit | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | DIST-02 | unit | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | SERV-01 | unit | `node --test test/server.test.js` | ✅ | ⬜ pending |
| 6-02-02 | 02 | 2 | DIST-01 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/packaging.test.js` — stubs for DIST-01, DIST-02 (files field, bin field, version)
- [ ] Verify `node --test` runs without additional framework install

*Existing test infrastructure (node:test) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npx gsd-browser` opens browser | DIST-01 | Requires real browser launch | Run `npx gsd-browser` on clean machine, verify browser opens |
| npm publish succeeds | DIST-02 | Requires npm registry auth | Run `npm publish --dry-run`, verify output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
