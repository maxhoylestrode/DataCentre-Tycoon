// Interior wall lookups. Walls sit on edges between tiles; the room's outer
// walls are not segments (the grid boundary already blocks everything).

import type { GameState, WallSegment } from './state';

export function wallAt(state: GameState, x: number, y: number, dir: 'h' | 'v'): WallSegment | undefined {
  return state.walls.find((w) => w.x === x && w.y === y && w.dir === dir);
}

// Only edges strictly inside the room can hold a wall.
export function isInteriorEdge(state: GameState, x: number, y: number, dir: 'h' | 'v'): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (dir === 'h') return x >= 0 && x < state.width && y >= 1 && y < state.height;
  return x >= 1 && x < state.width && y >= 0 && y < state.height;
}

// Fast "is there a wall between these neighbours" lookups, built once per use.
export interface WallGrid {
  // Wall between tile i and the tile above it (y - 1).
  up: Uint8Array;
  // Wall between tile i and the tile to its left (x - 1).
  left: Uint8Array;
}

export function wallGrid(state: GameState): WallGrid {
  const n = state.width * state.height;
  const grid: WallGrid = { up: new Uint8Array(n), left: new Uint8Array(n) };
  for (const w of state.walls) {
    const i = w.y * state.width + w.x;
    if (w.dir === 'h') grid.up[i] = 1;
    else grid.left[i] = 1;
  }
  return grid;
}

// Whether two orthogonally adjacent tiles are separated by a wall.
export function blocked(grid: WallGrid, width: number, x1: number, y1: number, x2: number, y2: number): boolean {
  if (x1 === x2) return grid.up[Math.max(y1, y2) * width + x1] === 1;
  return grid.left[y1 * width + Math.max(x1, x2)] === 1;
}

// Tiles a cooling unit at (cx, cy) reaches: within `radius` (square area)
// and connected to it without crossing a wall.
export function reachableTiles(
  state: GameState,
  grid: WallGrid,
  cx: number,
  cy: number,
  radius: number,
): number[] {
  const { width: w, height: h } = state;
  const seen = new Set<number>([cy * w + cx]);
  const queue: [number, number][] = [[cx, cy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (Math.abs(nx - cx) > radius || Math.abs(ny - cy) > radius) continue;
      const i = ny * w + nx;
      if (seen.has(i) || blocked(grid, w, x, y, nx, ny)) continue;
      seen.add(i);
      queue.push([nx, ny]);
    }
  }
  return [...seen];
}
