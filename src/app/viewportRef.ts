import type { Viewport } from '../render/viewport';

/** The 3D view that is on screen, if any. Lets other code (and browser tests) ask where things are. */
export const viewportRef: { current: Viewport | null } = { current: null };
