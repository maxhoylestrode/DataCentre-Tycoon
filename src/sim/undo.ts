// Undo for building changes. Before a player action the caller takes a
// snapshot of the layout (buildings, walls, floor, zones) and the cash; undo
// puts the layout back and returns the money the action spent (or takes back
// what a sale paid). Kept as plain data so it's easy to test.
//
// Only layout actions are undone. Anything that happened since (time passing,
// income) stays, so undo is meant for quick corrections: the caller keeps a
// short history and expires old entries.

import type { Building, FloorTile, GameState, WallSegment, ZoneTile } from './state';

export interface LayoutSnapshot {
  buildings: Building[];
  walls: WallSegment[];
  floor: FloorTile[];
  zones: ZoneTile[];
  cash: number;
}

export interface UndoEntry {
  before: LayoutSnapshot;
  // Cash change the action caused (negative = spent).
  cashDelta: number;
  label: string;
}

const copyBuilding = (b: Building): Building => ({ ...b, parts: { ...b.parts } });

export function takeSnapshot(state: GameState): LayoutSnapshot {
  return {
    buildings: state.buildings.map(copyBuilding),
    walls: state.walls.map((w) => ({ ...w })),
    floor: state.floor.map((f) => ({ ...f })),
    zones: state.zones.map((z) => ({ ...z })),
    cash: state.cash,
  };
}

// Whether the layout differs from the snapshot (i.e. the action did something).
export function layoutChanged(state: GameState, before: LayoutSnapshot): boolean {
  if (state.cash !== before.cash) return true;
  const key = (s: { buildings: Building[]; walls: WallSegment[]; floor: FloorTile[]; zones: ZoneTile[] }): string =>
    JSON.stringify([
      s.buildings.map((b) => [b.id, b.kind, b.x, b.y, b.rot, b.upgrade, b.parts]),
      s.walls,
      s.floor,
      s.zones,
    ]);
  return key(state) !== key(before);
}

// Records what an action did. Returns null if it did nothing.
export function makeEntry(state: GameState, before: LayoutSnapshot, label: string): UndoEntry | null {
  if (!layoutChanged(state, before)) return null;
  return { before, cashDelta: state.cash - before.cash, label };
}

// Puts the layout back. Buildings that still exist keep their live state
// (status, timers) unless the action changed them; ones the action removed
// come back as they were.
export function applyUndo(state: GameState, entry: UndoEntry): void {
  const live = new Map(state.buildings.map((b) => [b.id, b]));
  state.buildings = entry.before.buildings.map((old) => {
    const now = live.get(old.id);
    if (!now) return copyBuilding(old);
    // Position, facing and hardware go back; running state stays current.
    return { ...now, x: old.x, y: old.y, rot: old.rot, upgrade: old.upgrade, parts: { ...old.parts } };
  });
  state.walls = entry.before.walls.map((w) => ({ ...w }));
  state.floor = entry.before.floor.map((f) => ({ ...f }));
  state.zones = entry.before.zones.map((z) => ({ ...z }));
  state.cash -= entry.cashDelta;
  // Staff heading to buildings that moved or vanished need new routes.
  for (const s of state.staff) {
    s.task = null;
    s.path = [];
  }
}
