---
phase: 2
slug: rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — built-in |
| **Quick run command** | `node --test test/renderer.test.js` |
| **Full suite command** | `node --test test/renderer.test.js test/server.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command for affected module
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SERV-02, SERV-03, REND-01, REND-02 | unit | `node --test test/renderer.test.js` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | REND-02 | file check | `test -f public/styles/markdown.css && grep -q ".markdown-body" public/styles/markdown.css` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | SERV-02, SERV-03, REND-01, REND-02 | integration | `node --test test/server.test.js` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | REND-01, REND-02 | manual | checkpoint:human-verify | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/renderer.test.js` — unit tests for renderer module (GFM, Shiki, Mermaid)
- [ ] `test/server.test.js` — integration tests for server routes (/render, /, /styles)

*Tests created as part of TDD tasks in Plan 01 and Plan 02.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mermaid SVG renders visually correct diagrams | REND-01 | SVG output needs visual check | Open browser, load file with mermaid block, verify diagram renders |
| Prose typography is readable (line height, font size, max-width) | REND-02 | Visual/subjective layout check | Open browser, load long markdown file, verify readable layout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
