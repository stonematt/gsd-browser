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
| **Framework** | vitest |
| **Config file** | vitest.config.ts or "none — Wave 0 installs" |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | REND-01 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | SERV-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | REND-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | REND-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | SERV-03 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/rendering/markdown-render.test.ts` — stubs for REND-01 (GFM rendering)
- [ ] `tests/rendering/syntax-highlight.test.ts` — stubs for REND-02 (syntax highlighting)
- [ ] `tests/rendering/mermaid-render.test.ts` — stubs for SERV-03 (Mermaid diagrams)
- [ ] `tests/rendering/static-serve.test.ts` — stubs for SERV-02 (static file serving)
- [ ] vitest + happy-dom — install test framework if not present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mermaid SVG renders visually correct diagrams | SERV-03 | SVG output needs visual check | Open browser, load file with mermaid block, verify diagram renders |
| Prose typography is readable (line height, font size, max-width) | REND-01 | Visual/subjective layout check | Open browser, load long markdown file, verify readable layout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
