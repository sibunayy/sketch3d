# Release checklist

Do this on real devices before merging to `main` (which publishes the app and replaces the prototype).
Automated tests cannot stand in for any of it. Tick each box and write the result next to it.

## Chromebook (4 GB RAM, school model if possible)
- [ ] Open the app in Chrome. Draw, make parts, join them, sculpt and paint for 10 minutes.
- [ ] Dragging and rotating feel smooth (about 30 fps or better). Note any stutter: ______
- [ ] Memory stays steady (Chrome Task Manager, Shift+Esc). Start: ____ MB, after 10 min: ____ MB
- [ ] "Save to print" downloads an STL. Open it in the slicer (e.g. Bambu Studio for the P1S).
- [ ] The model is upright, in millimetres, and fits the 100 × 100 × 100 mm limit.
- [ ] The "flat base" option gives a flat bottom in the slicer preview.
- [ ] Offline: open once, turn Wi-Fi off, reload. Does the app and the last toy load? Result: ______

## iPad, in Chrome
- [ ] The page does not zoom or scroll when drawing (finger and Apple Pencil).
- [ ] Finger and Pencil both draw. Two fingers rotate/zoom the 3D view.
- [ ] Buttons are easy to hit. Nothing is hidden by the keyboard or the notch.
- [ ] "Save to print" puts the STL where the child can find it (Files app).
- [ ] 10 minutes of use without the tab reloading from low memory.
- [ ] **Record whether service workers work** (does it open with Wi-Fi off?): ______
  The app must work either way. Offline is only a bonus.

## Network
- [ ] On the school network, the host (GitHub Pages or other) is reachable.
- [ ] No requests go to other sites (DevTools → Network shows only the one host).

## Before merging
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run size && npm run test:e2e` all pass.
- [ ] Check screenshots at 1180×820, 820×1180, 1024×768, 1280×650 and 1366×768.
- [ ] Nathan has tried the app and is happy to replace the prototype.
- [ ] `legacy/` stays until this checklist is signed off, then it can be removed.
