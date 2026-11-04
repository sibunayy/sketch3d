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

  toolShapes: 'Shapes',
  toolHoles: 'Holes',
  holeRound: 'Round hole',
  holeSlot: 'Slot',

  // short help for each tool, shown while it is chosen
  hintSelect: 'Tap a part to pick it. Drag to move it.',
  hintDraw: 'Draw a loop to make a shape.',
  hintShape: 'Drag to make a shape, or tap to place one.',
  hintHole: 'Drag to cut a hole, or tap to place one.',
  hintLimb: 'Drag a line to make a tail or an arm.',
  hintEyes: 'Tap to put eyes on.',
  hintSmile: 'Tap to put a smile on.',
  hintCrease: 'Draw a line to carve a crease.',
  hintErase: 'Tap a part to remove it.',
  hintSize: 'Drag to make the part bigger or smaller.',
  hintTurn: 'Drag in a circle to turn the part.',
  hintReshape: 'Drag the edge to change the shape.',

  // messages from the tools
  toastPickFirst: 'Tap a part first.',
  toastLongerLine: 'Drag a longer line to make a tail or an arm.',
  toastFrontOnly: 'Switch to the Front view to use this.',
  toastSideLoop: 'Draw a closed shape around the part, from the side.',
  toastDeleted: 'Deleted.',
  toastSideUpdated: 'Side shape updated.',

  // settings panel
  btnCopy: 'Make a copy',
  btnDelete: 'Delete',
  btnPickSeveral: 'Pick several',
  btnResetTurn: 'Reset turn',
  panelPart: 'This part',
  panelParts: 'Parts',
  panelSeveral: 'parts picked',
  labelRound: 'How round?',
  roundSquare: 'Square',
  roundSoft: 'Soft',
  roundRound: 'Round',
  roundPill: 'Pill',
  labelThick: 'How thick?',
  labelMelt: 'Melt into touching parts',
  meltOff: 'Off',
  meltLittle: 'A little',
  meltSome: 'Some',
  meltLot: 'A lot',
  labelTurnGroup: 'Turn',
  labelSpin: 'Spin',
  labelTurn: 'Turn',
  labelTilt: 'Tilt',
  labelSquash: 'Squash and stretch',
  labelTaper: 'Make the top thinner',
  labelColour: 'Colour',
  mixed: 'Mixed',
  hole: 'Hole',
  toastCopied: 'Made a copy.',

  // 3D view
  modeMove: 'Move',
  modeSculpt: 'Sculpt',
  modePaint: 'Paint',
  labelModes: 'What to do in 3D',
  sculptPull: 'Pull',
  sculptPush: 'Push',
  sculptSmooth: 'Smooth',
  sculptGrab: 'Grab',
  labelSculptTool: 'Sculpt tool',
  labelSculptSize: 'Brush size',
  labelSculptStrength: 'Brush strength',
  sizeSmall: 'Small',
  sizeMedium: 'Medium',
  sizeLarge: 'Large',
  strengthGentle: 'Gentle',
  strengthFirm: 'Firm',
  btnFill: 'Fill the part',
  tipPick: 'Tap a part to pick it. Drag to turn the view.',
  tipGizmo: 'Drag an arrow to move, a ring to turn, or the white cube to resize.',
  tipSculpt: 'Drag on the toy to sculpt it.',
  tipPaint: 'Drag over a part to paint it.',

  // views
  tabFront: 'Front',
  tabSide: 'Side',
  tab3d: '3D',
  labelViews: 'Choose a view',
  labelTools: 'Tools',
  labelHistory: 'Undo and redo',

  // 3D view
  viewHome: 'Whole toy',
  viewFront: 'From front',
  viewSide: 'From side',
  viewTop: 'From above',
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
