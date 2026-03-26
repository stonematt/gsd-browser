# Design Reference: Dashboard Tile (Project Card)

**Purpose:** Art direction spec for the GSD project card shown on the dashboard landing page. This is what users see before clicking into a project.

**Source:** Art direction review session, 2026-03-25. Interactive prototypes built and iterated in Claude.ai conversation.

## Current State

The current tile shows: project name, milestone badge, focus text from STATE.md, plan progress fraction, last activity date, phase dots (green=complete, blue=active, gray=pending), and quick-links (PROJECT.md, STATE.md, ROADMAP.md).

## Design Target

### Phase dot strip on the card

**Compressed history, expanded frontier.** Completed phases render as small dots labeled only with their number. Active and future phases get full slug names. This prevents the dot strip from being dominated by history.

**Sub-phases branch below their parent on a stem.** Decimal phases (03.1, 04.5, 06.1) are NOT rendered as linear peers on the main axis. They drop below their parent phase on a short vertical stem, with a smaller dot. This visually communicates that they were inserted work, not original planned phases.

- Trunk dot sizes scale by plan count: 0 plans = 12px, 1-2 = 14px, 3-4 = 16px, 5+ = 20px
- Sub-phase dots are 4px smaller than trunk dots (minimum 8px)
- Nested inserts (e.g., 04.5.1) drop to a third row below their parent sub-phase, with even smaller dots

**Connector lines:**
- Green between two completed phases
- Neutral/gray between any other pair
- Sub-phase stems are 2px wide, 12-14px tall, neutral color

**Labels:**
- Compressed (completed) phases: number only (e.g., "01"), 10px, muted color, max-width 28px
- Expanded (active/future) phases: slug name (e.g., "Low-activity voice"), 11px, secondary color, max-width 88px, truncated with ellipsis
- Sub-phase labels: 10px, tertiary color, max-width 68px, truncated with tooltip for full name
- Plan counts shown only on expanded phases with plans > 0
- "0/0 plans" is NEVER shown. Pending phases with no plans show nothing.

### Minimap (below the dot strip)

A thumbnail-scale representation of the full timeline tree, shown below the scrollable dot strip.

**Row structure mirrors the branching depth:**
- Row 1: trunk phases (integer phases)
- Row 2: sub-phases (.1 level) positioned under their parent
- Row 3: nested inserts (.1.1 level) if any exist

**Minimap dots:**
- Trunk: 5-7px diameter, colored by status
- Sub-phases: 3-5px diameter, colored by status
- Spacing: 3-6px between dots, proportional to the main timeline spacing

**Viewport indicator:** A semi-transparent rectangle overlaid on the minimap showing which portion of the timeline is currently visible. Updates on scroll. Clicking the minimap scrolls the main timeline to that position.

### Card content (above the dot strip)

No changes from current design:
- Project name (bold, top-left)
- Milestone badge (top-right, e.g., "v1.1")
- Focus text from STATE.md status field
- Last activity date

### Quick-links (below the dot strip)

No changes: PROJECT.md, STATE.md, ROADMAP.md as clickable links.

## Color Tokens (theme-aware)

All colors MUST use CSS custom properties so both themes work. Do NOT hardcode hex values for surfaces, text, or borders.

### Status colors (same for both themes)
| Token | Value | Purpose |
|-------|-------|---------|
| --status-complete | #3fb950 | Green — completed phases |
| --status-active | #58a6ff | Blue — in-progress phases |
| --status-pending | (theme-dependent) | Gray — not-started phases |

### Surface/text tokens

| Token | Dark | Light | Purpose |
|-------|------|-------|---------|
| --bg-page | #0d1117 | #ffffff | Page background |
| --bg-surface | #161b22 | #f6f8fa | Card/panel background |
| --bg-elevated | #21262d | #e1e4e8 | Borders, dividers, elevated surfaces |
| --text-bright | #f0f6fc | #24292f | Headings, emphasis |
| --text-primary | #c9d1d9 | #3d4249 | Body text |
| --text-secondary | #8b949e | #656d76 | Labels, metadata |
| --text-muted | #484f58 | #afb8c1 | Hints, compressed labels |
| --accent | #58a6ff | #0969da | Links, selection indicators |
| --status-pending | #484f58 | #afb8c1 | Pending phase dots/text |
| --border | #21262d | #d0d7de | Dividers, column borders |

### Implementation approach

Use `prefers-color-scheme` media query or a `.theme-light` / `.theme-dark` class on the body. Define all tokens as CSS custom properties in a `:root` block with dark as default and light as override. The existing dark theme stays as-is; the light theme is additive.

```css
:root {
  --bg-page: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #21262d;
  --text-bright: #f0f6fc;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --accent: #58a6ff;
  --status-complete: #3fb950;
  --status-active: #58a6ff;
  --status-pending: #484f58;
  --border: #21262d;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg-page: #ffffff;
    --bg-surface: #f6f8fa;
    --bg-elevated: #e1e4e8;
    --text-bright: #24292f;
    --text-primary: #3d4249;
    --text-secondary: #656d76;
    --text-muted: #afb8c1;
    --accent: #0969da;
    --status-pending: #afb8c1;
    --border: #d0d7de;
  }
}
```

## Key Principles

1. The tile communicates project SHAPE at a glance — how much is done, how much is ahead, how much branching happened
2. History is compressed, not hidden — the dot strip and minimap both show completed work but don't let it dominate
3. Sub-phases read as subordinate, not as peers — branching depth is visible
4. Labels earn their space — no labels on compressed dots, no plan counts on pending phases
5. Theme-aware from the start — no hardcoded colors for surfaces or text
