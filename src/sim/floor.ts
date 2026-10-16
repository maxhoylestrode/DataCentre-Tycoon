// Underfloor cooling: floor vents only work while a working chiller within
// range has spare capacity to feed them.

import { buildingDef } from '../config';
import { type Building, categoryOf, type GameState, isRunning } from './state';

export interface VentFeed {
  // Tile indices (y * width + x) of vents that are being fed.
  fed: Set<number>;
  // How many vents each chiller is feeding, by building id.
  load: Map<number, number>;
}

function inRange(chiller: Building, x: number, y: number): boolean {
  const range = buildingDef(chiller.kind).chillerRange ?? 0;
  return Math.max(Math.abs(chiller.x - x), Math.abs(chiller.y - y)) <= range;
}

// Vents are fed in the order they were placed, each by the first chiller
// (oldest first) in range with spare capacity.
export function feedVents(state: GameState): VentFeed {
  const chillers = state.buildings.filter((b) => categoryOf(b) === 'chiller' && isRunning(b));
  const load = new Map<number, number>(chillers.map((c) => [c.id, 0]));
  const fed = new Set<number>();

  for (const vent of state.floor) {
    if (vent.kind !== 'floor_vent') continue;
    const chiller = chillers.find(
      (c) => inRange(c, vent.x, vent.y) && load.get(c.id)! < (buildingDef(c.kind).chillerCapacity ?? 0),
    );
    if (!chiller) continue;
    load.set(chiller.id, load.get(chiller.id)! + 1);
    fed.add(vent.y * state.width + vent.x);
  }
  return { fed, load };
}
