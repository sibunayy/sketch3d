import type { Store } from '../app/state';
import type { ShapeName } from '../core/geom/shapes';
import { creaseTool, drawTool, limbTool, shapeTool, stampTool } from './drawTools';
import { eraseTool, reshapeTool, selectTool, sizeTool, turnTool } from './editTools';
import type { Tool } from './toolKit';

export type { Tool, ToolPointer, View2D } from './toolKit';

// ---------- registry ----------

export const SHAPE_NAMES: ShapeName[] = ['circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon'];

/** Makes the tool for a tool id from the toolbar. `redraw` asks the canvas to draw again. */
export function createTool(id: string, store: Store, redraw: () => void): Tool {
  if (id.startsWith('shape:')) return shapeTool(store, redraw, id.slice(6) as ShapeName, false);
  if (id === 'hole:circle') return shapeTool(store, redraw, 'circle', true);
  if (id === 'hole:box') return shapeTool(store, redraw, 'box', true);
  switch (id) {
    case 'draw':
      return drawTool(store, redraw);
    case 'limb':
      return limbTool(store, redraw);
    case 'eyes':
      return stampTool(store, 'eyes');
    case 'smile':
      return stampTool(store, 'smile');
    case 'crease':
      return creaseTool(store, redraw);
    case 'erase':
      return eraseTool(store);
    case 'size':
      return sizeTool(store);
    case 'turn':
      return turnTool(store);
    case 'reshape':
      return reshapeTool(store);
    default:
      return selectTool(store);
  }
}

