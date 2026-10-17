// Interior wall lookups. Walls sit on edges between tiles; the room's outer
// walls are not segments (the grid boundary already blocks everything).

import { isLotBoundary, isOwnedTile, lotSize } from './lots';
import type { GameState, WallSegment } from './state';

export function wallAt(state: GameState, x: number, y: number, dir: 'h' | 'v'): WallSegment | undefined {
  return state.walls.find((w) => w.x === x && w.y === y && w.dir === dir);
}

// The two tiles an edge separates.
export function edgeTiles(x: number, y: number, dir: 'h' | 'v'): [[number, number], [number, number]] {
  return dir === 'h' ? [[x, y - 1], [x, y]] : [[x - 1, y], [x, y]];
}

// Edges between two owned tiles can hold a wall. Edges between two owned
// rooms are permanent walls, which can only be swapped for a door or glass.
export function isInteriorEdge(state: GameState, x: number, y: number, dir: 'h' | 'v'): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const inGrid = dir === 'h'
    ? x >= 0 && x < state.width && y >= 1 && y < state.height
    : x >= 1 && x < state.width && y >= 0 && y < state.height;
  if (!inGrid) return false;
  const [[x1, y1], [x2, y2]] = edgeTiles(x, y, dir);
  return isOwnedTile(state, x1, y1) && isOwnedTile(state, x2, y2);
}

// An edge on the building's outside: owned on one side, outside (off the map
// or an unowned room) on the other. Front doors go here.
export function isPerimeterEdge(state: GameState, x: number, y: number, dir: 'h' | 'v'): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const [[x1, y1], [x2, y2]] = edgeTiles(x, y, dir);
  return isOwnedTile(state, x1, y1) !== isOwnedTile(state, x2, y2);
}

// Where a wall of this kind may go: front doors on the outside, everything
// else inside.
export function isValidWallEdge(state: GameState, kind: string, x: number, y: number, dir: 'h' | 'v'): boolean {
  return kind === 'door_outside' ? isPerimeterEdge(state, x, y, dir) : isInteriorEdge(state, x, y, dir);
}

export function isRoomBoundaryEdge(state: GameState, x: number, y: number, dir: 'h' | 'v'): boolean {
  const [[x1, y1], [x2, y2]] = edgeTiles(x, y, dir);
  return isLotBoundary(state, x1, y1, x2, y2);
}

// Fast "is there a wall between these neighbours" lookups, built once per use.
export interface WallGrid {
  // Wall between tile i and the tile above it (y - 1).
  up: Uint8Array;
  // Wall between tile i and the tile to its left (x - 1).
  left: Uint8Array;
}

export function wallGrid(state: GameState): WallGrid {
  const { width: w, height: h } = state;
  const n = w * h;
  const grid: WallGrid = { up: new Uint8Array(n), left: new Uint8Array(n) };
  // Room boundaries are always walls (doors and glass in them still block heat).
  const lot = lotSize(state);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y > 0 && y % lot.h === 0) grid.up[y * w + x] = 1;
      if (x > 0 && x % lot.w === 0) grid.left[y * w + x] = 1;
    }
  }
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
