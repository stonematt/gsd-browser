# Art Direction Feedback: Dashboard Minimap — Final Polish

**Source:** Art direction review, 2026-03-28. Reviewed current rendering against design intent using live dashboard with gsd-browser and nitimini project data.

**Status:** The minimap concept is validated. Nitimini demonstrates the encoding working at scale. These notes are polish-pass feedback — not a redesign.

**Relationship to existing spec:** This is an addendum to `dashboard-tile-design-reference.md`. The "Minimap" section in that doc describes the dot-based minimap. That has been superseded by the rectangle-area minimap described here. The rest of that spec (card content, quick-links, color tokens, theme system) remains unchanged.

---

## What the minimap encodes

Each phase renders as a rectangle. The rectangle's dimensions encode two independent signals:

- **Width** scales by plan count — the number of execution plans the agent broke the work into. This represents implementation complexity.
- **Height** scales by requirement count — the number of tracked requirements the phase addresses. This represents human-scale value delivery.

Area (width × height) is therefore a composite effort footprint: "what we promised" × "how hard it is to build."

Child phases (sub-phases like 4.5, 4.5.1) render at **80% scale per depth level** below their parent, connected by thin vertical tree lines. Siblings sit side-by-side within their tier.

Status is encoded by color: green = complete, blue (with subtle glow) = active, gray (50% opacity) = pending.

## What's working

1. **Nitimini reads well.** The area contrast between heavy phases (6, 7) and lightweight ones (early phases) communicates real shape. You can see where the project invested effort without reading anything.
2. **The tree hierarchy is legible** when parent blocks are large enough to anchor the descent. Nitimini's 6→6.1 and 7→7.1 relationships are clear.
3. **Color-as-status is immediate.** Green trailing into gray tells the project's progress story at a glance.

---

## BLOCKERS — must fix before moving on

### B1. Tree connectors are not rendering

The vertical stems from parent → child tiers are missing entirely. Blocks at different depth levels just float at different vertical positions with no visible connection. Without connectors, the sub-phase hierarchy reads as "some blocks fell below the baseline" rather than "this phase branched."

**Required:**
- 1.5px vertical lines using `--border` color connecting the bottom edge of the parent block to the top edge of the child row.
- 6px minimum vertical gap between parent bottom and child top (the connector line spans this gap).
- Lines must be visible — verify they are actually rendering in the DOM, not just specified in CSS.

### B2. Blocks are too large — scale everything down 30-40%

The rectangles are eating too much card real estate. The minimap should feel like a **thumbnail** — compact, information-dense, subordinate to the frontier list below it. Right now it reads like a block diagram.

**Required:**
- Reduce the minimum rectangle size from 12×12px to **8×8px**.
- Reduce the max clamps from 40×32px to approximately **28×22px**.
- The total minimap height (including all tiers) should not exceed roughly **60-70px** on a typical card. If the tree goes 3 levels deep, blocks at each level need to be small enough to fit.
- Re-verify the 3:1 area ratio target still holds at the smaller scale.

### B3. Minimap must never wrap to a new line

At narrower viewports, the pending phases (visible as gray dots on nitimini) wrap below the minimap strip, breaking the chronological spine into two rows. This destroys the "left-to-right = chronological progression" reading.

**Required:**
- The minimap container must be `flex-wrap: nowrap` (or equivalent) — the trunk row is always a single horizontal line.
- If blocks don't fit at current size, **shrink them proportionally** to fit the available card width. The scaling should reduce all blocks uniformly so relative proportions are preserved.
- Do NOT clip/overflow-scroll. The entire minimap must be visible without interaction.
- Test at the narrower card width shown in the second screenshot — the minimap must remain a single-line strip.

---

## Polish items (address after blockers)

### 1. Area contrast must be dramatic, not subtle

The encoding only works when size differences are obvious at dashboard scale. If most rectangles are similar-sized, the minimap communicates "this is a project" instead of "this is the shape of the project."

**Guidance:**
- Ensure the scaling formula produces at least a **3:1 area ratio** between the heaviest and lightest phases in a project. If the raw data doesn't produce this, apply a floor/ceiling or a non-linear scale (e.g., sqrt) to stretch the range.
- The scaling should be **project-relative**, not absolute-across-projects. A 3-plan phase in a project where the max is 5 should look meaningfully large, not tiny because nitimini has a 12-plan phase.

### 2. The two-axis decomposition is a bonus, not the primary signal

Users will read area-as-effort at a glance. The width/height decomposition (plans vs. requirements) is a power-user detail. **Do not add a legend explaining the axes.** The encoding should either be self-evident to someone who understands the system, or simply read as "big = more work" to everyone else.

Let the data drive the aspect ratio naturally. If a phase has many requirements but few plans, it should be tall and narrow. If few requirements but many plans, wide and short. Don't force squares.

### 3. Pending phases at the end of the strip need connection

On gsd-browser, the gray pending phases (5, 6) float disconnected after the active sub-phase cluster. They read as orphans.

**Guidance:**
- Ensure a **continuous baseline** or connecting element along the chronological spine (row 1) so pending phases clearly continue the sequence.
- A faint horizontal rule at the trunk level ties the whole strip together regardless of gaps introduced by sub-phase branching.

### 4. Blue active glow needs restraint at small scale

The active phase glow competes with tree structure when rectangles are small.

**Guidance:**
- Scale the glow spread with the rectangle size. Large blocks can have a noticeable glow. Small blocks should use a tighter, more subtle indicator — a 2px bright border instead of a box-shadow spread.

---

## Key principle (reiterated)

The minimap tells the story of project shape at dashboard scale. It is a **thumbnail** — compact, subordinate to the text content on the card. **Area contrast is the primary signal.** Everything else — axis decomposition, tree lines, active indicators — is supporting detail. If the minimap is too large or wraps, it stops being a glance-level affordance and becomes a layout problem.

## Implementation priority

1. **B1** — Tree connectors rendering
2. **B2** — Scale down all blocks 30-40%
3. **B3** — No-wrap constraint with proportional shrink
4. Continuous trunk baseline for pending phases
5. Active glow scaling
6. Verify with both high-data (nitimini) and low-data (gsd-browser) at multiple viewport widths
