// A building's actual numbers after upgrades. Everything in the sim reads
// these rather than the raw config, so upgrades apply everywhere at once.

import { buildingDef, CONFIG } from '../config';
import type { Building, GameState } from './state';

export interface BuildingStats {
  income: number;
  upkeep: number;
  powerDraw: number;
  powerSupply: number;
  heat: number;
  coolingStrength: number;
  coolingRadius: number;
}

export function buildingStats(building: Building, level: number = building.upgrade): BuildingStats {
  const def = buildingDef(building.kind);
  const output = 1 + def.upgrade.output * level;
  return {
    income: def.incomePerTick * output,
    upkeep: def.upkeepPerTick,
    powerDraw: def.powerDraw * (1 + def.upgrade.powerDraw * level),
    powerSupply: def.powerSupply * output,
    heat: def.heatPerTick * (1 + def.upgrade.heat * level),
    coolingStrength: def.coolingStrength * output,
    coolingRadius: def.coolingRadius,
  };
}

// Cost to go from the building's current upgrade level to the next.
export function upgradeCost(building: Building, level: number = building.upgrade): number {
  const U = CONFIG.upgrades;
  return Math.round((buildingDef(building.kind).cost * U.firstCostFraction * U.costGrowth ** level) / 10) * 10;
}

// Purchase price plus every upgrade bought; selling refunds a share of this.
export function investedValue(building: Building): number {
  let total = buildingDef(building.kind).cost;
  for (let l = 0; l < building.upgrade; l++) total += upgradeCost(building, l);
  return total;
}

// 0 when just built, rising linearly to 1 over rackRampTicks.
export function rackFill(state: GameState, rack: Building): number {
  return Math.min(1, Math.max(0, (state.tick - rack.builtAtTick) / CONFIG.economy.rackRampTicks));
}
