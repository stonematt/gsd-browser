---
phase: 5
slug: navigation-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (bundled with Node 20+) |
| **Config file** | none — test files discovered via `node --test test/` |
| **Quick run command** | `node --test test/renderer.test.js` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/renderer.test.js`
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | NAV-05 | unit | `node --test test/renderer.test.js` | ✅ (extend) | ⬜ pending |
| 05-01-02 | 01 | 1 | NAV-05 | unit | `node --test test/renderer.test.js` | ✅ (extend) | ⬜ pending |
| 05-01-03 | 01 | 1 | NAV-06 | unit | `node --test test/renderer.test.js` | ✅ (extend) | ⬜ pending |
| 05-01-04 | 01 | 1 | NAV-06 | unit | `node --test test/renderer.test.js` | ✅ (extend) | ⬜ pending |
| 05-01-05 | 01 | 1 | NAV-06 | unit | `node --test test/renderer.test.js` | ✅ (extend) | ⬜ pending |
| 05-02-01 | 02 | 2 | NAV-04 | unit | `node --test test/server.test.js` | ✅ (extend) | ⬜ pending |
| 05-02-02 | 02 | 2 | NAV-04 | manual | visual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. New tests extend `test/renderer.test.js` with NAV-04/05/06 describe blocks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clicking a relative .md link navigates in the SPA | NAV-04 | Client-side click interception in browser | Load a doc with relative links, click one, verify content pane updates |
| TOC dropdown opens/collapses visually | NAV-06 | CSS/HTML interaction | Load a multi-heading doc, click TOC toggle, verify it expands/collapses |
| Heading anchor scroll + URL update | NAV-05 | Browser scroll behavior | Click heading anchor, verify scroll and URL hash update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
