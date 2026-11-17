# Panel Result Flexible Height Design

## Intent

Make the enhancement result area use the panel's currently available height and respond as the OpenChamber window changes size. Long result text should scroll inside the result area rather than continually stretching the panel.

## Goals

- The result area expands to use otherwise available panel space.
- Resizing the OpenChamber window causes the result area to grow or shrink with the available viewport.
- The history list and expanded settings keep their content-sized space and reduce the result area's share of the layout.
- Overflowing result text scrolls within `#result`.
- Preserve existing narrow-screen behavior and panel controls.

## Non-goals

- No fixed pixel panel height or JavaScript resize observer/height calculations.
- No changes to history storage, generation behavior, or settings behavior.

## Approaches

1. **Dynamic viewport CSS layout (recommended):** size the panel layout against the current viewport and let the result area flex. CSS responds directly to window resizing and avoids a JS measurement loop.
2. **Content-driven layout with a capped result:** preserve natural page growth and cap the result area. This does not reliably fill unused panel space, so it misses the primary goal.

## Design

Use CSS dynamic viewport sizing and a flex/grid layout with shrinkable intermediate containers. Give `#result` the flexible space, `min-height: 0`, and internal vertical overflow. Keep history and settings content-sized so they consume space before the result area. Validate layout rules and run the existing typecheck/test/build checks, including the committed panel-bundle freshness check.

## Acceptance

- The result area has internal vertical scrolling when its text exceeds its allocated height.
- The result area expands into available height and shrinks when history or settings need space.
- The layout follows viewport-height changes without fixed pixel sizing or resize JavaScript.
- Existing tests, typecheck, and build pass; generated `panel/main.js` remains fresh if the build updates it.
