# GSD Browser

## Phase Number Convention

Phase numbers exist in two forms:
- **Padded** (`numStr`): from directory names — `01`, `04.5`, `04.5.3`. Used for file path construction only.
- **Unpadded** (`displayNum`): from ROADMAP headings — `1`, `4.5`, `4.5.3`. Used for display, map lookups (`phaseNames`, `phaseGoals`), and identity comparisons.

Always use `normalizePhaseNum()` (server) or `phase.displayNum` (client) when looking up phase names/goals or displaying phase numbers. Never use `numStr` for display or map keys — it will silently fail because `phaseNames["01"]` is undefined when the map key is `"1"`.

## Dev Server

- Port: 4242
- Start: `node src/server.js`
- Tests: `node --test test/server.test.js`
