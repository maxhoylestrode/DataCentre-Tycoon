import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { type GameState, isRunning } from './state';

// Power units in a full 2×2 square form a multiblock. Each unit belongs to
// at most one block; squares are claimed scanning top-left first. Returns
// the ids of units in a block, and each block's top-left corner.
export function powerMultiblocks(state: GameState): { members: Set<number>; corners: { x: number; y: number }[] } {
  const at = new Map<string, number>();
  for (const b of state.buildings) {
    if (b.kind === 'power_basic' && isRunning(b)) at.set(`${b.x},${b.y}`, b.id);
  }
  const members = new Set<number>();
  const corners: { x: number; y: number }[] = [];
  const sorted = [...state.buildings].filter((b) => at.has(`${b.x},${b.y}`)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of sorted) {
    const ids = [
      at.get(`${b.x},${b.y}`),
      at.get(`${b.x + 1},${b.y}`),
      at.get(`${b.x},${b.y + 1}`),
      at.get(`${b.x + 1},${b.y + 1}`),
    ];
    if (ids.some((id) => id === undefined || members.has(id))) continue;
    for (const id of ids) members.add(id!);
    corners.push({ x: b.x, y: b.y });
  }
  return { members, corners };
}

export function powerSupply(state: GameState): number {
  const { members } = powerMultiblocks(state);
  return state.buildings.reduce<number>((sum, b) => {
    if (!isRunning(b)) return sum;
    const supply = buildingStats(b).powerSupply;
    return sum + (members.has(b.id) ? supply * (1 + CONFIG.multiblock.bonus) : supply);
  }, CONFIG.power.baseSupply);
}

// What everything that is switched on wants to draw. Failed and repairing racks draw nothing.
export function powerDraw(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + (isRunning(b) ? buildingStats(b).powerDraw : 0), 0);
}

// Brownout: when draw exceeds supply, everything runs at supply / draw.
// 1 means fully powered.
export function powerEfficiency(state: GameState): number {
  const draw = powerDraw(state);
  if (draw <= 0) return 1;
  return Math.min(1, powerSupply(state) / draw);
}

// The electricity bill per tick for what's actually drawn (capped by supply),
// using marginal price bands.
export function electricityCost(state: GameState): number {
  const used = Math.min(powerDraw(state), powerSupply(state));
  return electricityFor(used);
}

export function electricityFor(kw: number): number {
  const bands = CONFIG.electricity.bands;
  let cost = 0;
  for (let i = 0; i < bands.length; i++) {
    const from = bands[i]!.aboveKw;
    const to = bands[i + 1]?.aboveKw ?? Infinity;
    if (kw <= from) break;
    cost += (Math.min(kw, to) - from) * bands[i]!.perKwTick;
  }
  return cost;
}
