---
phase: 4
slug: browser-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, no install needed) |
| **Config file** | none — `node --test test/` in package.json scripts |
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
| 04-01-01 | 01 | 0 | NAV-01 | unit | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | NAV-02 | unit | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | DSGN-01 | smoke | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 0 | DSGN-02 | smoke | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 0 | NAV-01 | unit | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/server.test.js` — Add tests for new `/api/sources/:name/tree` endpoint (NAV-01, NAV-02)
- [ ] `test/server.test.js` — Add test for `/render?fragment=true` mode (NAV-01 integration)
- [ ] `test/server.test.js` — Add tests for `GET /` HTML structure (DSGN-01, DSGN-02 partial)
- No new test files needed — add to existing `test/server.test.js`

*Existing infrastructure covers framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three-panel layout renders correctly | DSGN-01 | Visual layout verification | Open `http://localhost:3000`, verify sidebar + content + header panels visible |
| Dark theme colors applied consistently | DSGN-02 | Visual color verification | Verify dark background, text contrast, consistent theme |
| File tree expand/collapse interaction | NAV-02 | Browser interaction | Click directory nodes, verify expand/collapse with arrow indicators |
| Source switcher updates tree and content | NAV-03 | Multi-step browser interaction | Select different source from dropdown, verify tree + content update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
