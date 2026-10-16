import { type BuildingKind, buildingDef, CONFIG } from '../config';
import { powerEfficiency } from './power';
import { type Building, type GameState, isRunning } from './state';

const E = CONFIG.economy;

// 0 when just built, rising linearly to 1 over rackRampTicks.
export function rackFill(state: GameState, rack: Building): number {
  return Math.min(1, Math.max(0, (state.tick - rack.builtAtTick) / E.rackRampTicks));
}

// Only working racks earn, scaled by fill and by brownout efficiency.
export function incomePerTick(state: GameState): number {
  const efficiency = powerEfficiency(state);
  return state.buildings.reduce(
    (sum, b) => sum + (isRunning(b) ? buildingDef(b.kind).incomePerTick * rackFill(state, b) * efficiency : 0),
    0,
  );
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
