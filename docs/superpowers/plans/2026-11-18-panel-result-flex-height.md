# Panel Result Flexible Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the enhancement result fill the panel's available height, respond to OpenChamber window resizing, and scroll its content internally.

**Architecture:** Use CSS dynamic viewport sizing and a shrinkable flex/grid column; `#result` receives remaining space with `min-height: 0` and `overflow-y: auto`. History and expanded settings remain content-sized and therefore take space from the result area. No JavaScript resize measurement is needed.

**Tech Stack:** Existing HTML/CSS in `panel/index.html`, Vitest tests, project build scripts.

**Spec:** `docs/superpowers/specs/2026-11-18-panel-result-flex-height-design.md`

## Global Constraints

- Use the current dynamic viewport height; do not hardcode a pixel panel height.
- Do not add JavaScript resize observers or layout-height calculations.
- Preserve history and settings content; they reduce the result area's available share.
- Long result text scrolls inside `#result`.

## Review Focus

- Short content and a tall viewport: result area should use available empty space. Verify flex growth in the layout rule.
- Long content and a short viewport: the panel should not be stretched by result text. Verify `min-height: 0` and internal `overflow-y: auto`.
- Expanded settings and populated history: result should shrink while those sections remain usable. Verify shrinkable parent layout and content-sized sections.
- Viewport height changes: result allocation should follow the new available space without script. Verify dynamic viewport CSS and, if browser validation is available, inspect two viewport heights.
- Narrow viewport: retain the existing history responsive rules and avoid horizontal overflow. Verify the existing history CSS rules remain intact.

---

### Task 1: Make the result area flexible and internally scrollable

**Files:**
- Modify: `panel/index.html` styles for `body`, `main`, `#result`, and any required layout wrappers
- Test: `tests/openchamber-panel.test.ts`

**Interfaces:**
- Consumes: existing panel elements `#result`, `details`, and `#history`.
- Produces: a CSS-only layout where the panel tracks dynamic viewport height, settings/history occupy their natural height, and `#result` takes remaining space and scrolls internally.

- [x] **Step 1: Add a focused layout regression test**

Add a test named `lets the result fill the dynamic viewport and scroll its own content` that reads `panel/index.html` and asserts:
- layout uses a dynamic viewport height unit (such as `100dvh`), not a fixed pixel height;
- the main layout is shrinkable (`min-height: 0` on the relevant flex/grid chain);
- `#result` can grow into available space and has `min-height: 0` plus `overflow-y: auto`;
- history's existing three-row scroll cap and narrow-screen rule remain present.

- [x] **Step 2: Run the focused test and verify it fails first**

Run: `npx vitest run tests/openchamber-panel.test.ts -t "dynamic viewport"`
Expected: FAIL because the current stylesheet does not define a dynamic-height result layout.

- [x] **Step 3: Implement the CSS layout**

In `panel/index.html`, make the body/main layout use the current dynamic viewport height and a shrinkable column layout. Let the content above the result and the history/settings regions use natural size; give `#result` flexible growth, `min-height: 0`, and `overflow-y: auto`. Avoid changing panel markup unless the existing DOM cannot express the layout cleanly.

- [x] **Step 4: Run focused and full verification**

Run:
- `npx vitest run tests/openchamber-panel.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run build`
- the repository's panel bundle freshness check (confirm whether the build updates `panel/main.js`; no JS bundle change is expected for CSS-only work).

Expected: all checks pass; the existing history styles remain in place; resizing the viewport changes the result area's allocated height, and long result text scrolls inside it.
