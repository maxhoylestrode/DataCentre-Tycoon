import { type BuildingKind, buildingDef, CONFIG, floorDef } from '../config';
import { ageFactor, buildingStats, maintenanceFactor, rackFill } from './buildings';
import { allocateRacks, contractIncomePerTick, type RackAllocation } from './contracts';
import { roomsOwned } from './lots';
import { networkEfficiency, uplinkOf } from './network';
import { electricityCost, powerEfficiency } from './power';
import type { Building, GameState } from './state';
import { inServerZone } from './zones';

export { rackFill } from './buildings';

const E = CONFIG.economy;

export interface IncomeBreakdown {
  // Working racks not under contract: scaled by fill, power, network, age,
  // maintenance, server rooms and market saturation.
  walkIn: number;
  // Racks serving contracts: contract rate, no ramp-up, scaled by power and network.
  contracts: number;
  allocation: RackAllocation;
  // Power × network efficiency: how much of the racks' work actually gets done.
  efficiency: number;
  // Market saturation factor applied to walk-in income (1 = no saturation).
  market: number;
}

// Walk-in customers run out as you grow: past `freeRacks` walk-in racks,
// each earns less.
export function marketFactor(walkInRacks: number): number {
  const M = CONFIG.market;
  if (walkInRacks <= M.freeRacks) return 1;
  return Math.max(M.minFactor, (M.freeRacks / walkInRacks) ** M.exponent);
}

// What one walk-in rack earns this tick, before market saturation.
export function walkInRackIncome(state: GameState, b: Building, efficiency: number): number {
  const zone = inServerZone(state, b) ? 1 + CONFIG.zones.serverRoomBonus : 1;
  return (
    buildingStats(b).income * rackFill(state, b) * efficiency * ageFactor(state, b) * maintenanceFactor(state, b) * zone
  );
}

export function incomeBreakdown(state: GameState): IncomeBreakdown {
  const efficiency = powerEfficiency(state) * networkEfficiency(state);
  const allocation = allocateRacks(state);
  const market = marketFactor(allocation.walkIn.length);
  const walkIn = allocation.walkIn.reduce((sum, b) => sum + walkInRackIncome(state, b, efficiency), 0) * market;
  return { walkIn, contracts: contractIncomePerTick(state, allocation, efficiency), allocation, efficiency, market };
}

export function incomePerTick(state: GameState): number {
  const { walkIn, contracts } = incomeBreakdown(state);
  return walkIn + contracts;
}

export interface CostBreakdown {
  rent: number;
  upkeep: number;
  electricity: number;
  network: number;
  wages: number;
  total: number;
}

export function wagesPerTick(state: GameState): number {
  return state.staff.reduce((sum, s) => sum + (s.founder ? 0 : CONFIG.staff.roles[s.role].wagePerTick), 0);
}

export function costBreakdown(state: GameState): CostBreakdown {
  const m = E.runningCostMultiplier;
  const rent = E.rentPerTick * roomsOwned(state) * m;
  const upkeep =
    state.buildings.reduce((sum, b) => sum + buildingStats(b).upkeep, 0) +
    state.floor.reduce((sum, f) => sum + floorDef(f.kind).upkeepPerTick * m, 0);
  const electricity = electricityCost(state);
  const network = uplinkOf(state).rentalPerTick;
  const wages = wagesPerTick(state);
  return { rent, upkeep, electricity, network, wages, total: rent + upkeep + electricity + network + wages };
}

// Rent for every room, upkeep for every building and floor tile, the
// electricity bill, the internet line and staff wages.
export function costsPerTick(state: GameState): number {
  return costBreakdown(state).total;
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
