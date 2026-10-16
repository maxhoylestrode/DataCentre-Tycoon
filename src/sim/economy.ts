import { type BuildingKind, buildingDef, CONFIG } from '../config';
import { allocateRacks, contractIncomePerTick, type RackAllocation } from './contracts';
import { powerEfficiency } from './power';
import type { Building, GameState } from './state';

const E = CONFIG.economy;

// 0 when just built, rising linearly to 1 over rackRampTicks.
export function rackFill(state: GameState, rack: Building): number {
  return Math.min(1, Math.max(0, (state.tick - rack.builtAtTick) / E.rackRampTicks));
}

export interface IncomeBreakdown {
  // Working racks not under contract: scaled by fill and brownout efficiency.
  walkIn: number;
  // Racks serving contracts: contract rate, no ramp-up, scaled by efficiency.
  contracts: number;
  allocation: RackAllocation;
  efficiency: number;
}

export function incomeBreakdown(state: GameState): IncomeBreakdown {
  const efficiency = powerEfficiency(state);
  const allocation = allocateRacks(state);
  const walkIn = allocation.walkIn.reduce(
    (sum, b) => sum + buildingDef(b.kind).incomePerTick * rackFill(state, b) * efficiency,
    0,
  );
  return { walkIn, contracts: contractIncomePerTick(state, allocation, efficiency), allocation, efficiency };
}

export function incomePerTick(state: GameState): number {
  const { walkIn, contracts } = incomeBreakdown(state);
  return walkIn + contracts;
}

// Rent plus upkeep for every building, working or not.
export function costsPerTick(state: GameState): number {
  return state.buildings.reduce<number>((sum, b) => sum + buildingDef(b.kind).upkeepPerTick, E.rentPerTick);
}

export function netIncomePerTick(state: GameState): number {
  return incomePerTick(state) - costsPerTick(state);
}

export function canAfford(state: GameState, kind: BuildingKind): boolean {
  return state.cash >= buildingDef(kind).cost;
}

// Repairs cost a fraction of what that rack cost to buy.
export function repairCost(rack: Building): number {
  return buildingDef(rack.kind).cost * E.repairCostFraction;
}

export function applyEconomy(state: GameState): void {
  state.cash += netIncomePerTick(state);
}
