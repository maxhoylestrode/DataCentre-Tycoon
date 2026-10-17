// Walking routes for staff and clients: breadth-first search over tiles.
// People walk on owned, empty tiles; walls block them except doors; the
// walls between rooms block them unless a door has been put in.

import { isWallKind } from '../config';
import { isLotBoundary, isOwnedTile } from './lots';
import type { GameState } from './state';
import { edgeTiles } from './walls';

export type Tile = [number, number];

const DOOR_KINDS = new Set(['wall_door', 'door_outside']);

export interface WalkGrid {
  state: GameState;
  // Tiles with a building on them.
  occupied: Set<string>;
  // Wall segments by edge key "x,y,dir" -> wall kind.
  walls: Map<string, string>;
}

export function walkGrid(state: GameState): WalkGrid {
  return {
    state,
    occupied: new Set(state.buildings.map((b) => `${b.x},${b.y}`)),
    walls: new Map(state.walls.map((w) => [`${w.x},${w.y},${w.dir}`, w.kind])),
  };
}

export function isWalkable(grid: WalkGrid, x: number, y: number): boolean {
  return isOwnedTile(grid.state, x, y) && !grid.occupied.has(`${x},${y}`);
}

// The edge between two orthogonally adjacent tiles, as a wall key.
function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  return x1 === x2 ? `${x1},${Math.max(y1, y2)},h` : `${Math.max(x1, x2)},${y1},v`;
}

// Whether a person can step between two adjacent tiles.
export function canStep(grid: WalkGrid, x1: number, y1: number, x2: number, y2: number): boolean {
  const kind = grid.walls.get(edgeKey(x1, y1, x2, y2));
  if (kind !== undefined) return DOOR_KINDS.has(kind) && isWallKind(kind);
  return !isLotBoundary(grid.state, x1, y1, x2, y2);
}

const STEPS: Tile[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Shortest walk from `start` to any tile where `goal` is true. Returns the
// tiles to walk through (excluding start), or null if unreachable. The start
// tile itself doesn't need to be walkable (people standing on odd spots can
// always walk off).
export function findPath(grid: WalkGrid, start: Tile, goal: (x: number, y: number) => boolean): Tile[] | null {
  const key = (x: number, y: number): string => `${x},${y}`;
  if (goal(start[0], start[1])) return [];
  const prev = new Map<string, string | null>([[key(start[0], start[1]), null]]);
  const queue: Tile[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k) || !isWalkable(grid, nx, ny) || !canStep(grid, x, y, nx, ny)) continue;
      prev.set(k, key(x, y));
      if (goal(nx, ny)) {
        const path: Tile[] = [];
        for (let at: string | null = k; at && at !== key(start[0], start[1]); at = prev.get(at) ?? null) {
          const [px, py] = at.split(',').map(Number);
          path.unshift([px!, py!]);
        }
        return path;
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

// Walkable tiles next to (x, y) that can step onto it: where a person stands
// to work on a building there.
export function standsNextTo(grid: WalkGrid, x: number, y: number): (tx: number, ty: number) => boolean {
  return (tx, ty) =>
    Math.abs(tx - x) + Math.abs(ty - y) === 1 && canStep(grid, tx, ty, x, y);
}

// Front doors: door_outside segments with the room on one side and outside
// (off the map or an unowned room) on the other. Returns the inside tile and
// the outside tile people appear on.
export function frontDoors(state: GameState): { inside: Tile; outside: Tile }[] {
  const doors: { inside: Tile; outside: Tile }[] = [];
  for (const w of state.walls) {
    if (w.kind !== 'door_outside') continue;
    const [a, b] = edgeTiles(w.x, w.y, w.dir);
    const aIn = isOwnedTile(state, a[0], a[1]);
    const bIn = isOwnedTile(state, b[0], b[1]);
    if (aIn && !bIn) doors.push({ inside: a, outside: b });
    else if (bIn && !aIn) doors.push({ inside: b, outside: a });
  }
  return doors;
}
