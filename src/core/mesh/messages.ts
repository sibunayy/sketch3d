/**
 * What to tell a child when a 3D shape file cannot be opened, or opens with a catch.
 * Written at about a grade 3 reading level. `ui/copy.ts` includes these, so the reading-level
 * check covers them too.
 */
export const STL_MESSAGES = {
  notAShape: "That file isn't a 3D shape we can open. Try a different .stl file.",
  empty: 'That file has no shape in it. Try a different .stl file.',
  broken: 'That file looks damaged, so it cannot be opened. Try saving it again.',
  tooDetailed: 'That shape has too much detail for this app. Try a simpler one.',
  tooBig: 'That file is too big to open. Try a smaller one.',
  madeSmaller: 'We made it smaller so it fits.',
  madeBigger: 'We made it bigger so you can see it.',
  hasGaps: 'This shape has gaps. It may not print well.',
  opening: 'Opening your shape…',
  added: 'Added your shape.',
} as const;
