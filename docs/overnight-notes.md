
## UX redesign: context bar (merged to main after all checks passed)
- Students could not find the settings on the right. On wide screens (1100 px and wider, landscape) the right-hand panel is **gone**. Its controls are now a **context bar under the toy**: a parts strip, then buttons for what to change (Shape, Stretch, Turn, Melt, Colour) with Make a copy and Delete beside them, then only that group's controls.
- Same height for every group, so the toy never jumps. With nothing picked, it says "Tap a part to change it."
- Clearer words: "Spin like a wheel", "Turn left or right", "Nod up or down", "Top thinner or wider".
- Code: `src/ui/panels/ContextBar.tsx`, shared controls in `partFields.tsx`. `Inspector.tsx` still shows the full list in the sheet on narrow screens.
- Not done / to review with students:
  - Narrow and portrait screens (iPad upright) still use the "Edit this part" sheet.
  - On very short screens (about 650 px tall) the bar takes a lot of room, so the drawing area is small.
  - Not research-tested with children. This is a first version for testing in class.
- The Superdesign canvas was not used (it needs a browser login).
