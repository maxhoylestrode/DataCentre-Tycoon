import { type BuildingKind, buildingDef, CONFIG, floorDef } from '../config';
import { buildingStats, rackFill } from './buildings';
import { allocateRacks, contractIncomePerTick, type RackAllocation } from './contracts';
import { roomsOwned } from './lots';
import { powerEfficiency } from './power';
import type { Building, GameState } from './state';

export { rackFill } from './buildings';

const E = CONFIG.economy;

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
    (sum, b) => sum + buildingStats(b).income * rackFill(state, b) * efficiency,
    0,
  );
  return { walkIn, contracts: contractIncomePerTick(state, allocation, efficiency), allocation, efficiency };
}

export function incomePerTick(state: GameState): number {
  const { walkIn, contracts } = incomeBreakdown(state);
  return walkIn + contracts;
}

// Rent for every room owned, plus upkeep for every building (working or
// not) and floor tile.
export function costsPerTick(state: GameState): number {
  const rent = E.rentPerTick * roomsOwned(state) * E.runningCostMultiplier;
  const buildings = state.buildings.reduce<number>((sum, b) => sum + buildingStats(b).upkeep, rent);
  return state.floor.reduce(
    (sum, f) => sum + floorDef(f.kind).upkeepPerTick * E.runningCostMultiplier,
    buildings,
  );
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
