/**
 * What to tell a child when a toy cannot be printed yet: what is wrong, and what to do about it.
 * Written at about a grade 3 reading level. `ui/copy.ts` includes these, so the reading-level
 * check covers them too.
 */
export type PrintIssueCode = 'empty' | 'only-cuts' | 'too-big' | 'too-thin' | 'floating' | 'not-watertight';

export const PRINT_MESSAGES: Record<PrintIssueCode, { message: string; fix: string }> = {
  empty: {
    message: 'There is nothing to print yet.',
    fix: 'Draw a shape first.',
  },
  'only-cuts': {
    message: 'You only have holes, so there is nothing to print.',
    fix: 'Add a solid shape.',
  },
  'too-big': {
    message: 'Your toy is too big for the printer.',
    fix: 'Make it smaller.',
  },
  'too-thin': {
    message: 'Some parts are very thin, so they could break.',
    fix: 'Make them thicker.',
  },
  floating: {
    message: 'Some parts are floating apart from the rest.',
    fix: 'Move them to touch, or turn on Melt.',
  },
  'not-watertight': {
    message: 'The shape has a tiny gap in it.',
    fix: 'Make the part a little bigger, or draw it again.',
  },
};
