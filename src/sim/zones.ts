// Zones: tiles painted as server room, staff room or storage. Furniture
// placed on a zone's tiles makes it work (see CONFIG.staff).

import { buildingDef, CONFIG, type ZoneKind } from '../config';
import { type Building, type GameState, isRunning, zoneAt } from './state';

export function zoneTiles(state: GameState, kind: ZoneKind): number {
  return state.zones.filter((z) => z.kind === kind).length;
}

// Running furniture of this kind standing on its matching zone.
function furnitureInZone(state: GameState, kind: string): Building[] {
  return state.buildings.filter(
    (b) => b.kind === kind && isRunning(b) && zoneAt(state, b.x, b.y)?.kind === buildingDef(b.kind).zone,
  );
}

// Staff the company can house. A staff room needs a coffee machine; then
// each break table in it houses more staff.
export function staffCapacity(state: GameState): number {
  const S = CONFIG.staff;
  const hasCoffee = furnitureInZone(state, 'coffee_machine').length > 0;
  const tables = hasCoffee ? furnitureInZone(state, 'break_table').length : 0;
  return S.baseCapacity + tables * S.perBreakTable;
}

// A storage room: shelving on storage-zone tiles.
export function hasStorage(state: GameState): boolean {
  return furnitureInZone(state, 'shelving').length > 0;
}

export function inServerZone(state: GameState, b: Building): boolean {
  return zoneAt(state, b.x, b.y)?.kind === 'server';
}
