// Grid-edge maths for drawing walls. Pure functions over grid coordinates,
// so they're testable without a renderer.
//
// "Grid coordinates" here are world positions shifted so the room's corner
// is (0, 0): gx = world.x + width / 2, gy = world.z + height / 2. Tile (x, y)
// covers gx in [x, x + 1) and gy in [y, y + 1).

export interface Edge {
  x: number;
  y: number;
  dir: 'h' | 'v';
}

// The grid edge closest to a point, and how far away it is.
export function nearestEdge(gx: number, gy: number): { edge: Edge; distance: number } {
  const dv = Math.abs(gx - Math.round(gx));
  const dh = Math.abs(gy - Math.round(gy));
  if (dv < dh) return { edge: { x: Math.round(gx), y: Math.floor(gy), dir: 'v' }, distance: dv };
  return { edge: { x: Math.floor(gx), y: Math.round(gy), dir: 'h' }, distance: dh };
}

// The grid corner (where lines cross) closest to a point.
export function nearestCorner(gx: number, gy: number): { x: number; y: number } {
  return { x: Math.round(gx), y: Math.round(gy) };
}

// Edges along a straight wall from corner a towards corner b. The wall
// follows whichever axis the drag moved further along.
export function edgesBetween(a: { x: number; y: number }, b: { x: number; y: number }): Edge[] {
  const edges: Edge[] = [];
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++) edges.push({ x, y: a.y, dir: 'h' });
  } else {
    for (let y = Math.min(a.y, b.y); y < Math.max(a.y, b.y); y++) edges.push({ x: a.x, y, dir: 'v' });
  }
  return edges;
}
