// Goal and achievement conditions. Content refers to these by `type`.
// To add a condition type: add it to the Condition union, add one evaluator
// to EVALUATORS, and add one test in tests/progression.test.ts.

import { isBuildingKind } from '../config';
import { installedPart, slotsOf } from './buildings';
import { netIncomePerTick } from './economy';
import { feedVents } from './floor';
import { levelInfo } from './levels';
import { roomsOwned } from './lots';
import { prestigeOf } from './prestige';
import { dayOf, type GameState, racksOf } from './state';

export type Condition =
  | { type: 'rackCount'; min: number }
  | { type: 'buildingCount'; kind: string; min: number }
  | { type: 'totalEarned'; min: number }
  | { type: 'netIncome'; min: number }
  | { type: 'cash'; min: number }
  | { type: 'day'; min: number }
  | { type: 'repairs'; min: number }
  | { type: 'failures'; min: number }
  | { type: 'level'; min: number }
  | { type: 'contractsSigned'; min: number }
  | { type: 'contractsCompleted'; min: number }
  | { type: 'contractsFailed'; min: number }
  | { type: 'activeContracts'; min: number }
  | { type: 'perfectContracts'; min: number }
  | { type: 'upgrades'; min: number }
  | { type: 'highestUpgrade'; min: number }
  | { type: 'prestige'; min: number }
  | { type: 'fedVents'; min: number }
  | { type: 'liquidCooledRacks'; min: number }
  | { type: 'roomsOwned'; min: number };

export type ConditionType = Condition['type'];

// How far along a condition is. Met when current >= target.
export interface ConditionProgress {
  current: number;
  target: number;
}

type Evaluators = { [T in ConditionType]: (state: GameState, c: Extract<Condition, { type: T }>) => number };

// Each returns the current value that is compared against `min`.
const EVALUATORS: Evaluators = {
  rackCount: (s) => racksOf(s).length,
  buildingCount: (s, c) => s.buildings.filter((b) => b.kind === c.kind).length,
  totalEarned: (s) => s.progress.stats.totalEarned,
  netIncome: (s) => netIncomePerTick(s),
  cash: (s) => s.cash,
  day: (s) => dayOf(s),
  repairs: (s) => s.progress.stats.repairs,
  failures: (s) => s.progress.stats.failures,
  level: (s) => levelInfo(s.progress.xp).level,
  contractsSigned: (s) => s.progress.stats.contractsSigned,
  contractsCompleted: (s) => s.progress.stats.contractsCompleted,
  contractsFailed: (s) => s.progress.stats.contractsFailed,
  activeContracts: (s) => s.contracts.active.length,
  perfectContracts: (s) => s.progress.stats.perfectContracts,
  upgrades: (s) => s.progress.stats.upgrades,
  highestUpgrade: (s) => s.buildings.reduce((m, b) => Math.max(m, b.upgrade), 0),
  prestige: (s) => prestigeOf(s),
  fedVents: (s) => feedVents(s).fed.size,
  // Racks with any cooling part beyond stock air cooling.
  liquidCooledRacks: (s) =>
    s.buildings.filter((b) => slotsOf(b).includes('cooling') && (installedPart(b, 'cooling')?.heatReduction ?? 0) > 0).length,
  roomsOwned: (s) => roomsOwned(s),
};

export function isConditionType(type: string): type is ConditionType {
  return Object.hasOwn(EVALUATORS, type);
}

export function evaluate(state: GameState, condition: Condition): ConditionProgress {
  const evaluator = EVALUATORS[condition.type] as (s: GameState, c: Condition) => number;
  return { current: evaluator(state, condition), target: condition.min };
}

export function isMet(state: GameState, condition: Condition): boolean {
  const { current, target } = evaluate(state, condition);
  return current >= target;
}

// Content checks used by the validation test. Returns problems, empty if fine.
export function validateCondition(condition: Condition): string[] {
  const problems: string[] = [];
  if (!isConditionType(condition.type)) problems.push(`unknown condition type "${condition.type}"`);
  if (typeof condition.min !== 'number' || !Number.isFinite(condition.min)) problems.push('min must be a number');
  if (condition.type === 'buildingCount' && !isBuildingKind(condition.kind)) {
    problems.push(`unknown building kind "${condition.kind}"`);
  }
  return problems;
}
