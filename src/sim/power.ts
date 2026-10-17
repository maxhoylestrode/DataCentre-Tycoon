import { buildingDef, CONFIG } from '../config';
import { buildingStats } from './buildings';
import { researchBonus } from './research';
import { activeEffect } from './events';
import { upsBackupKw } from './safety';
import { batteryFlow, electricityRate, moveBatteryCharge } from './daynight';
import { categoryOf, type GameState, isRunning } from './state';

// Four power sources of the same kind in a full 2×2 square form a
// multiblock. Each belongs to at most one block; squares are claimed scanning
// top-left first. Returns the ids in a block, and each block's top-left corner.
export function powerMultiblocks(state: GameState): { members: Set<number>; corners: { x: number; y: number }[] } {
  const at = new Map<string, { id: number; kind: string }>();
  for (const b of state.buildings) {
    if (categoryOf(b) === 'power' && isRunning(b)) at.set(`${b.x},${b.y}`, { id: b.id, kind: b.kind });
  }
  const members = new Set<number>();
  const corners: { x: number; y: number }[] = [];
  const sorted = [...state.buildings].filter((b) => at.has(`${b.x},${b.y}`)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of sorted) {
    const cells = [
      at.get(`${b.x},${b.y}`),
      at.get(`${b.x + 1},${b.y}`),
      at.get(`${b.x},${b.y + 1}`),
      at.get(`${b.x + 1},${b.y + 1}`),
    ];
    if (cells.some((c) => c === undefined || c.kind !== b.kind || members.has(c.id))) continue;
    const ids = cells.map((c) => c!.id);
    for (const id of ids) members.add(id!);
    corners.push({ x: b.x, y: b.y });
  }
  return { members, corners };
}

// Supply split by source: grid-fed (the mains connection, power units and
// substations, hit by power cuts), renewable (not billed) and the rest
// (on-site generators). Research bonuses included.
export function supplyBySource(state: GameState): { grid: number; renewable: number; local: number } {
  const { members } = powerMultiblocks(state);
  const boost = 1 + researchBonus(state, 'powerOutput');
  const out = { grid: CONFIG.power.baseSupply * boost, renewable: 0, local: 0 };
  for (const b of state.buildings) {
    if (!isRunning(b) || categoryOf(b) !== 'power') continue;
    const def = buildingDef(b.kind);
    const supply = buildingStats(b).powerSupply * (members.has(b.id) ? 1 + CONFIG.multiblock.bonus : 1) * boost;
    if (def.renewable) out.renewable += supply;
    else if (def.gridFed) out.grid += supply;
    else out.local += supply;
  }
  return out;
}

// kW of backup the UPS batteries can give during a power cut (more with upgrades).
export function backupPower(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + (isRunning(b) ? upsBackupKw(b) : 0), 0);
}

// Share of grid-fed supply lost right now: a blackout is a deeper power cut.
function gridLossShare(state: GameState): number {
  if (activeEffect(state, 'blackout')) return CONFIG.lateEvents.blackoutLoss;
  if (activeEffect(state, 'power_cut')) return CONFIG.events.powerCutLoss;
  return 0;
}

// kW of grid supply a power cut takes, before batteries.
export function gridLost(state: GameState): number {
  return supplyBySource(state).grid * gridLossShare(state);
}

// kW the batteries are covering in a power cut (only while they have charge).
export function backupCovering(state: GameState): number {
  if (state.battery.charge <= 0) return 0;
  return Math.min(gridLost(state), backupPower(state));
}

// kW lost right now to a power cut, after UPS batteries cover what they can.
export function powerCutLoss(state: GameState): number {
  return Math.max(0, gridLost(state) - backupCovering(state));
}

// Runs every tick: batteries drain while covering a power cut, and otherwise
// charge at night and discharge at the peak (day/night, live world only).
export function stepBattery(state: GameState): void {
  const backup = backupPower(state);
  const covering = backupCovering(state);
  if (covering > 0) {
    if (state.liveWorld) moveBatteryCharge(state, backup, -covering);
    return;
  }
  const flow = batteryFlow(state, backup, powerDraw(state));
  moveBatteryCharge(state, backup, flow.chargeKw - flow.dischargeKw);
}

export function powerSupply(state: GameState): number {
  const s = supplyBySource(state);
  return s.grid + s.renewable + s.local - powerCutLoss(state);
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
// using marginal price bands. Renewable output is used first and is free.
// Batteries charging add to the bill; discharging takes off it. In a live
// world the price follows the time of day.
export function electricityCost(state: GameState): number {
  const draw = powerDraw(state);
  const used = Math.min(draw, powerSupply(state));
  const flow = backupCovering(state) > 0 ? { chargeKw: 0, dischargeKw: 0 } : batteryFlow(state, backupPower(state), draw);
  const billable = Math.max(0, used - supplyBySource(state).renewable + flow.chargeKw - flow.dischargeKw);
  return electricityFor(billable) * electricityRate(state) * (1 - researchBonus(state, 'electricityDiscount'));
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
