import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { edgesBetween, nearestCorner, nearestEdge } from '../src/input/walls';
import { placeBuilding, placeWall, removeWall } from '../src/sim/commands';
import { stepHeat } from '../src/sim/heat';
import { totalXpForLevel } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, type GameState, tempAt } from '../src/sim/state';
import { reachableTiles, wallGrid } from '../src/sim/walls';

function wallState(level = 10): GameState {
  const state = createInitialState(12, 10);
  state.cash = 1_000_000;
  state.progress.xp = totalXpForLevel(level);
  return state;
}

// A vertical wall the full height of the room along grid line x = gx.
function wallLine(state: GameState, gx: number): void {
  for (let y = 0; y < state.height; y++) expect(placeWall(state, 'wall_basic', gx, y, 'v').ok).toBe(true);
}

describe('placing walls', () => {
  it('goes on interior edges, charges the cost, and can be removed for a refund', () => {
    const state = wallState();
    const cash = state.cash;
    expect(placeWall(state, 'wall_basic', 3, 2, 'v')).toEqual({ ok: true });
    expect(state.cash).toBe(cash - CONFIG.walls.wall_basic.cost);
    expect(removeWall(state, 3, 2, 'v')).toEqual({ ok: true });
    expect(state.walls).toHaveLength(0);
    expect(state.cash).toBe(cash - CONFIG.walls.wall_basic.cost * (1 - CONFIG.economy.sellRefund));
  });

  it('rejects the outer room edges and anything off the grid', () => {
    const state = wallState();
    expect(placeWall(state, 'wall_basic', 0, 3, 'v').ok).toBe(false); // left room wall
    expect(placeWall(state, 'wall_basic', 12, 3, 'v').ok).toBe(false); // right room edge
    expect(placeWall(state, 'wall_basic', 3, 0, 'h').ok).toBe(false); // back room wall
    expect(placeWall(state, 'wall_basic', 3, 10, 'h').ok).toBe(false); // front room edge
    expect(placeWall(state, 'wall_basic', 1.5, 3, 'v').ok).toBe(false);
  });

  it('one wall per edge, but walls and buildings can share a tile', () => {
    const state = wallState();
    placeBuilding(state, 'rack_basic', 3, 3);
    expect(placeWall(state, 'wall_basic', 3, 3, 'v').ok).toBe(true);
    expect(placeWall(state, 'wall_glass', 3, 3, 'v')).toEqual({ ok: false, reason: 'occupied' });
    expect(placeWall(state, 'wall_basic', 3, 3, 'h').ok).toBe(true);
  });

  it('are locked at level 1, and glass walls need level 8', () => {
    expect(placeWall(wallState(1), 'wall_basic', 3, 3, 'v')).toEqual({ ok: false, reason: 'locked' });
    expect(placeWall(wallState(5), 'wall_glass', 3, 3, 'v')).toEqual({ ok: false, reason: 'locked' });
  });

  it('need enough cash', () => {
    const state = wallState();
    state.cash = CONFIG.walls.wall_basic.cost - 1;
    expect(placeWall(state, 'wall_basic', 3, 3, 'v')).toEqual({ ok: false, reason: 'insufficient_funds' });
  });
});

describe('walls and heat', () => {
  it('heat does not spread through a wall', () => {
    const open = wallState();
    const walled = wallState();
    for (const s of [open, walled]) {
      for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) placeBuilding(s, 'rack_basic', x, y);
    }
    wallLine(walled, 6);
    for (let i = 0; i < 400; i++) {
      stepHeat(open, 1);
      stepHeat(walled, 1);
    }
    // Just the other side of the wall stays at room temperature...
    expect(tempAt(walled, 6, 4)).toBeCloseTo(CONFIG.heat.ambient, 5);
    expect(tempAt(open, 6, 4)).toBeGreaterThan(CONFIG.heat.ambient + 2);
    // ...and the walled-in racks run hotter, since heat can't escape that way.
    expect(tempAt(walled, 5, 4)).toBeGreaterThan(tempAt(open, 5, 4));
  });

  it('cooling units only reach tiles on their own side', () => {
    const state = wallState();
    wallLine(state, 6);
    const tiles = reachableTiles(state, wallGrid(state), 5, 4, 2);
    const xs = tiles.map((i) => i % state.width);
    expect(Math.max(...xs)).toBe(5);
    expect(tiles).toHaveLength(3 * 5); // x 3..5, y 2..6
  });

  it('a cooler on the far side of a wall does not help', () => {
    const run = (wall: boolean): number => {
      const state = wallState();
      for (let i = 0; i < 3; i++) placeBuilding(state, 'power_basic', i, 9);
      for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) placeBuilding(state, 'rack_basic', x, y);
      placeBuilding(state, 'cooling_fan', 7, 4);
      if (wall) wallLine(state, 6);
      for (let i = 0; i < 600; i++) stepHeat(state, 1);
      return tempAt(state, 5, 4);
    };
    expect(run(true)).toBeGreaterThan(run(false) + 3);
  });
});

describe('wall saves', () => {
  it('round-trip, dropping unknown kinds and bad edges', () => {
    const state = wallState();
    placeWall(state, 'wall_door', 4, 4, 'h');
    const save = JSON.parse(serialize(state));
    save.data.walls.push({ kind: 'wall_lava', x: 2, y: 2, dir: 'h' }, { kind: 'wall_basic', x: 0, y: 2, dir: 'v' });
    const result = deserialize(JSON.stringify(save));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.walls).toEqual([{ kind: 'wall_door', x: 4, y: 4, dir: 'h' }]);
  });

  it('older saves load with no walls', () => {
    const save = JSON.parse(serialize(wallState()));
    save.version = 5;
    delete save.data.walls;
    const result = deserialize(JSON.stringify(save));
    expect(result.ok && result.state.walls).toEqual([]);
  });
});

describe('wall drawing maths', () => {
  it('finds the nearest grid edge to a point', () => {
    expect(nearestEdge(3.05, 4.5).edge).toEqual({ x: 3, y: 4, dir: 'v' });
    expect(nearestEdge(3.5, 4.9).edge).toEqual({ x: 3, y: 5, dir: 'h' });
    expect(nearestEdge(3.5, 4.9).distance).toBeCloseTo(0.1);
  });

  it('snaps to the nearest corner', () => {
    expect(nearestCorner(2.4, 6.6)).toEqual({ x: 2, y: 7 });
  });

  it('lays a straight line of edges along the longer drag axis', () => {
    expect(edgesBetween({ x: 2, y: 3 }, { x: 5, y: 4 })).toEqual([
      { x: 2, y: 3, dir: 'h' }, { x: 3, y: 3, dir: 'h' }, { x: 4, y: 3, dir: 'h' },
    ]);
    expect(edgesBetween({ x: 4, y: 6 }, { x: 4, y: 4 })).toEqual([
      { x: 4, y: 4, dir: 'v' }, { x: 4, y: 5, dir: 'v' },
    ]);
    expect(edgesBetween({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});
