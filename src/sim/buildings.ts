// A building's actual numbers after upgrades and parts. Everything in the
// sim reads these rather than the raw config, so upgrades apply everywhere.

import { buildingDef, CONFIG, type PartSlot } from '../config';
import { PARTS } from './content/parts';
import type { ContractRequirement, Part } from './content/types';
import type { Building, GameState } from './state';

export interface BuildingStats {
  income: number;
  upkeep: number;
  powerDraw: number;
  powerSupply: number;
  heat: number;
  coolingStrength: number;
  coolingRadius: number;
  prestige: number;
}

// Slot paths built once: stats are computed for every rack several times a tick.
const PATHS = new Map<PartSlot, Part[]>();
const BY_ID = new Map<string, Part>();
for (const part of PARTS) {
  if (!PATHS.has(part.slot)) PATHS.set(part.slot, []);
  PATHS.get(part.slot)!.push(part);
  BY_ID.set(part.id, part);
}

// The upgrade path for a slot, stock part first.
export function partsForSlot(slot: PartSlot): Part[] {
  return PATHS.get(slot) ?? [];
}

export function slotsOf(building: Building): readonly PartSlot[] {
  return buildingDef(building.kind).slots ?? [];
}

// The part in a slot; unknown or missing ids fall back to the stock part.
export function installedPart(building: Building, slot: PartSlot): Part | undefined {
  const id = building.parts[slot];
  const part = id ? BY_ID.get(id) : undefined;
  return part?.slot === slot ? part : partsForSlot(slot)[0];
}

// The next part along the slot's path, or null when the best is installed.
export function nextPart(building: Building, slot: PartSlot): Part | null {
  const path = partsForSlot(slot);
  const current = installedPart(building, slot);
  const index = current ? path.indexOf(current) : -1;
  return path[index + 1] ?? null;
}

const U = CONFIG.upgrades;

// Parts are priced per server, so bigger racks pay more for the same part.
export function partCost(building: Building, part: Part): number {
  return Math.round((part.cost * (buildingDef(building.kind).partMultiplier ?? 1) * U.costMultiplier) / 10) * 10;
}

// What a part adds to this rack, after the rack's multipliers.
export function partContribution(building: Building, part: Part): { income: number; powerDraw: number } {
  const def = buildingDef(building.kind);
  return {
    income: part.income * U.partIncomeMultiplier * (def.partMultiplier ?? 1),
    powerDraw: part.powerDraw * (def.powerFactor ?? 1),
  };
}

export function buildingStats(building: Building, level: number = building.upgrade): BuildingStats {
  const def = buildingDef(building.kind);
  const output = 1 + def.upgrade.output * level;
  const stats: BuildingStats = {
    income: def.incomePerTick * output,
    upkeep: def.upkeepPerTick * CONFIG.economy.runningCostMultiplier,
    powerDraw: def.powerDraw * (1 + def.upgrade.powerDraw * level),
    powerSupply: def.powerSupply * output,
    heat: def.heatPerTick * (1 + def.upgrade.heat * level),
    coolingStrength: def.coolingStrength * output,
    coolingRadius: def.coolingRadius,
    prestige: def.prestige ?? 0,
  };

  const slots = slotsOf(building);
  if (slots.length > 0) {
    let income = def.incomePerTick;
    let powerDraw = def.powerDraw;
    let heat = def.heatPerTick;
    let heatReduction = 0;
    for (const slot of slots) {
      const part = installedPart(building, slot);
      if (!part) continue;
      income += part.income * U.partIncomeMultiplier;
      powerDraw += part.powerDraw;
      heat += part.heat;
      heatReduction = Math.max(heatReduction, part.heatReduction ?? 0);
    }
    stats.income = income * (def.partMultiplier ?? 1);
    stats.powerDraw = powerDraw * (def.powerFactor ?? 1);
    stats.heat = heat * (def.heatFactor ?? 1) * (1 - heatReduction);
  }
  return stats;
}

// Cost to go from the building's current upgrade level to the next.
export function upgradeCost(building: Building, level: number = building.upgrade): number {
  const base = buildingDef(building.kind).cost * U.firstCostFraction * U.costGrowth ** level * U.costMultiplier;
  return Math.round(base / 10) * 10;
}

// Purchase price plus every upgrade and part bought; selling refunds a share of this.
export function investedValue(building: Building): number {
  let total = buildingDef(building.kind).cost;
  for (let l = 0; l < building.upgrade; l++) total += upgradeCost(building, l);
  for (const slot of slotsOf(building)) {
    const path = partsForSlot(slot);
    const current = installedPart(building, slot);
    const upTo = current ? path.indexOf(current) : 0;
    for (let i = 1; i <= upTo; i++) total += partCost(building, path[i]!);
  }
  return total;
}

// CPU cores across the whole rack: cores per server × servers.
export function rackCores(building: Building): number {
  if (!slotsOf(building).includes('cpu')) return 0;
  const cpu = installedPart(building, 'cpu');
  return Math.round((cpu?.cores ?? 0) * (buildingDef(building.kind).partMultiplier ?? 1));
}

export function rackTier(building: Building): number {
  return buildingDef(building.kind).tier ?? 0;
}

// Whether a rack can serve a contract with this requirement.
export function meetsRequirement(building: Building, req: ContractRequirement | undefined): boolean {
  if (!slotsOf(building).length) return false;
  if (!req) return true;
  if (req.minRackTier !== undefined && rackTier(building) < req.minRackTier) return false;
  if (req.minCores !== undefined && rackCores(building) < req.minCores) return false;
  if (req.gpu && !slotsOf(building).includes('gpu')) return false;
  return true;
}

// How many part upgrades a rack has had, used for its trim colour and pips.
export function partTierTotal(building: Building): number {
  return slotsOf(building).reduce((sum, slot) => {
    const current = installedPart(building, slot);
    return sum + (current ? partsForSlot(slot).indexOf(current) : 0);
  }, 0);
}

// 0 when just built, rising linearly to 1 over rackRampTicks.
export function rackFill(state: GameState, rack: Building): number {
  return Math.min(1, Math.max(0, (state.tick - rack.builtAtTick) / CONFIG.economy.rackRampTicks));
}
