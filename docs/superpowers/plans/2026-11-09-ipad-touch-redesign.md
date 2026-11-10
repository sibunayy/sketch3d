# iPad touch redesign: plan for Nathan's OK

Status: **draft, nothing built yet.** Please read, then tell me yes, no, or what to change.

Target: iPad Pro 11" (M1), Chrome (Safari engine), fingers only, landscape (1194 × 834 px). Portrait keeps working but is not the focus.

## What you told me
- Held in **landscape**.
- Students get stuck on **small 3D handles** and on **not knowing what happened** after a change.
- Group the 12 tools into **steps**, in a **top bar**.
- Fix handles with **bigger handles and extra grab room**.
- Show changes with a **flash on the changed part**.
- One bigger redesign, shown as a **written plan with a mock-up picture**.

## What I found in other apps
The web search found little. Tinkercad's iPad app is the only close match: one finger turns the view, two fingers pan and pinch to zoom, and the controls are made for touch. It matches what Sketch3D already does. Morphi, a finger-driven kids' app, looks discontinued. I found no useful write-ups of other kids' 3D tools, so these ideas come from your answers and the code, not from copying another app. Apple's guidance is a 44 pt minimum target; our 48 px rule is already larger.

## Today vs proposed (see the pictures)
Today: `images/ipad-landscape-today.png`. Proposed: `images/ipad-landscape-mockup.png` (rough mock-up, not real code).

## Changes, in the order I would build them
Each is one branch and one PR, tests first, as in the plan rules.

### 1. Handles that are easy to grab
- Today a finger must be within 28 px of a handle (`HANDLE_REACH_PX` in `src/render/gizmoMath.ts`). The arrows, rings and cube are thin lines.
- First I measure, on a 1194 × 834 screenshot, how far apart the handles are when a toy is small, so I do not make handles overlap.
- Then: thicker arrows and rings, a bigger resize cube, and a bigger grab area on touch. When two handles are close, the nearest one wins (already true), and the handle you are holding lights up.
- Test: a unit test for the grab area, and a browser test that taps each handle at its edge on the iPad profile.

### 2. Flash on the changed part
- After a move, turn, resize, melt, colour or tool action, the changed part glows for under 1 second in both the 2D and 3D views.
- With "reduce motion" on, it is a still highlight for the same time, with no movement.
- The app still draws only when needed. The flash asks for a few frames, then stops.
- No sound and no wording change for now. If students still do not understand, a short plain-words note with Undo is the next thing to try.

### 3. Steps bar on top, left rail removed
- A new bar under the title bar. **Pick** is always on the left and **Erase** on the right. In the middle, three big steps and the tools for the chosen step:
  - **1 Make:** Draw, Shapes, Holes, Tail or arm
  - **2 Change:** Reshape, Size, Turn
  - **3 Decorate:** Eyes, Smile, Crease
- Only one step's tools show at a time, so 5 or 6 buttons are on screen instead of 12.
- The drawing area gets about 100 px more width because the left rail is gone.
- Every button is at least 48 px, and the step buttons are about 68 px tall.
- Undo and Redo stay bottom-left of the drawing view.

### 4. Touch polish
- Leave space for the iPad's bottom home bar (`env(safe-area-inset-bottom)`).
- Check that double-tap zoom, edge swipes and a resting palm do not draw or move anything.
- Check that nothing needs hover.

## Words
All new text goes in `src/ui/copy.ts`, grade 3 reading level, sentence case. "Make", "Change" and "Decorate" are the names I suggest. The step names may need changing after you try them with students.

## Things I need from you
1. Are **Make / Change / Decorate** the right three steps? Melt and Colour stay in the bar under the toy.
2. The title bar already holds 5 buttons plus the new steps bar. Is that too busy? I could move "Add an STL file" and "Help" into a small "More" button.
3. After the build, can you try it with 2 or 3 students on a real iPad and tell me what happens?

## What I will not do
- No new libraries, no change to the folder layout, no removed features.
- No redraw of your icons.
- Nothing merged to `main` without your OK.

## Done means
The full check from CLAUDE.md passes, and I have looked at screenshots at 1194 × 834 and 834 × 1194 (iPad), and 1180 × 820, 1024 × 768, 1280 × 650 and 1366 × 768 (the other sizes in CLAUDE.md). I cannot test with real fingers here, so a real iPad check is still needed.
