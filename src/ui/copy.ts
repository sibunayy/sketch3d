/**
 * Every word the child sees lives here, so the reading level and tone can be checked in one place.
 * Rules: about grade 3 reading level, sentence case, buttons start with a verb, no jargon,
 * and errors say what happened and what to do next without blaming anyone.
 * Keys starting with "btn" are button labels (they must start with a verb).
 */
export const copy = {
  appName: 'Sketch3D',

  // buttons
  btnUndo: 'Undo',
  btnRedo: 'Redo',
  btnSaveToPrint: 'Save to print',
  btnDraw: 'Draw',
  btnSee3d: 'See in 3D',
  btnEditPart: 'Edit this part',
  btnClose: 'Close',
  btnDismiss: 'Got it',

  // tool names (shown under each icon)
  toolSelect: 'Pick',
  toolDraw: 'Draw',
  toolLimb: 'Tail or arm',
  toolReshape: 'Reshape',
  toolSize: 'Size',
  toolTurn: 'Turn',
  toolEyes: 'Eyes',
  toolSmile: 'Smile',
  toolCrease: 'Crease',
  toolErase: 'Erase',

  // views
  tabFront: 'Front',
  tabSide: 'Side',
  tab3d: '3D',
  labelViews: 'Choose a view',
  labelTools: 'Tools',
  labelHistory: 'Undo and redo',

  // 3D view
  viewHome: 'Home',
  viewFront: 'Front',
  viewSide: 'Side',
  viewTop: 'Top',
  viewLost: 'The 3D view stopped. Tap to restart it.',

  // empty and status
  emptyToy: 'Draw a shape to start.',
  inspectorEmpty: 'Tap a part to change it.',
  saved: 'Saved',
  saving: 'Saving…',
  notSaved: 'Not saved',
  working: 'Working…',

  // errors and messages
  changeFailed: "That change didn't work. Your toy is safe. Try again.",
  scribble: 'Draw a bigger, closed loop and try again.',
  untwisted: 'Your outline crossed itself, so I untwisted it.',
} as const;

export type CopyKey = keyof typeof copy;
