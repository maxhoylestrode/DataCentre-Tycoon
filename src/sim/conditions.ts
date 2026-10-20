// Goal and achievement conditions. Content refers to these by `type`.
// To add a condition type: add it to the Condition union, add one evaluator
// to EVALUATORS, and add one test in tests/progression.test.ts.

import { CONFIG, isBuildingKind, ZONE_KINDS, type ZoneKind } from '../config';
import { installedPart, nextPart, slotsOf } from './buildings';
import { netIncomePerTick } from './economy';
import { ddosBlocked, isProtectedFromFire } from './events';
import { feedVents } from './floor';
import { levelInfo } from './levels';
import { roomsOwned } from './lots';
import { uplinkOf } from './network';
import { frontDoors } from './paths';
import { receptionDesks } from './people';
import { backupPower, powerDraw, powerMultiblocks, supplyBySource } from './power';
import { completedDecorSets, prestigeOf } from './prestige';
import { categoryOf, dayOf, type GameState, racksOf } from './state';

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
  | { type: 'roomsOwned'; min: number }
  | { type: 'staffCount'; min: number; role?: string }
  | { type: 'uplinkMbps'; min: number }
  | { type: 'multiblocks'; min: number }
  | { type: 'zoneTiles'; zone: string; min: number }
  | { type: 'clientsServed'; min: number }
  | { type: 'services'; min: number }
  | { type: 'refurbishes'; min: number }
  | { type: 'receptionReady'; min: number }
  | { type: 'levelWithoutHires'; min: number }
  | { type: 'airCooledRacks'; min: number }
  | { type: 'rackModels'; min: number }
  | { type: 'maxedRacks'; min: number }
  | { type: 'decorKinds'; min: number }
  | { type: 'decorSets'; min: number }
  | { type: 'overdrafts'; min: number }
  | { type: 'quickSells'; min: number }
  | { type: 'fires'; min: number }
  | { type: 'firesStopped'; min: number }
  | { type: 'attacksStopped'; min: number }
  | { type: 'blackoutsWeathered'; min: number }
  | { type: 'companiesSold'; min: number }
  | { type: 'researchDone'; min: number }
  | { type: 'reputation'; min: number }
  | { type: 'certifications'; min: number }
  | { type: 'renewableShare'; min: number }
  | { type: 'upsCoverage'; min: number }
  | { type: 'suppressionCoverage'; min: number }
  | { type: 'firewallBlock'; min: number }
  | { type: 'recentUptime'; min: number; days: number };

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
  // Hired staff, not counting the founder.
  staffCount: (s, c) => s.staff.filter((m) => !m.founder && (!c.role || m.role === c.role)).length,
  uplinkMbps: (s) => uplinkOf(s).mbps,
  multiblocks: (s) => powerMultiblocks(s).corners.length,
  zoneTiles: (s, c) => s.zones.filter((z) => z.kind === c.zone).length,
  clientsServed: (s) => s.progress.stats.clientsServed,
  services: (s) => s.progress.stats.services,
  refurbishes: (s) => s.progress.stats.refurbishes,
  // 1 when clients can reach a reception desk through a front door.
  receptionReady: (s) => (frontDoors(s).length > 0 && receptionDesks(s).length > 0 ? 1 : 0),
  // Your level, as long as you've never hired anyone (0 once you have).
  levelWithoutHires: (s) => (s.progress.stats.staffHired === 0 ? levelInfo(s.progress.xp).level : 0),
  // Racks, as long as none of them has liquid cooling (0 once one does).
  airCooledRacks: (s) => (EVALUATORS.liquidCooledRacks(s, { type: 'liquidCooledRacks', min: 0 }) > 0 ? 0 : racksOf(s).length),
  rackModels: (s) => new Set(racksOf(s).map((b) => b.kind)).size,
  // Racks with the best part in every slot.
  maxedRacks: (s) => racksOf(s).filter((b) => slotsOf(b).every((slot) => nextPart(b, slot) === null)).length,
  decorKinds: (s) => new Set(s.buildings.filter((b) => categoryOf(b) === 'decor').map((b) => b.kind)).size,
  decorSets: (s) => completedDecorSets(s).length,
  overdrafts: (s) => s.progress.stats.overdrafts,
  quickSells: (s) => s.progress.stats.quickSells,
  fires: (s) => s.progress.stats.fires,
  firesStopped: (s) => s.progress.stats.firesStopped,
  attacksStopped: (s) => s.progress.stats.attacksStopped,
  blackoutsWeathered: (s) => s.progress.stats.blackoutsWeathered,
  companiesSold: (s) => s.legacy.sales,
  researchDone: (s) => s.research.done.length,
  reputation: (s) => s.reputation,
  certifications: (s) => s.compliance.held.length,
  // Share of power drawn that renewables supply, 0..1 (0 with nothing drawn).
  renewableShare: (s) => {
    const draw = powerDraw(s);
    return draw > 0 ? Math.min(1, supplyBySource(s).renewable / draw) : 0;
  },
  // UPS backup over power draw, 0..1.
  upsCoverage: (s) => {
    const draw = powerDraw(s);
    return draw > 0 ? Math.min(1, backupPower(s) / draw) : 0;
  },
  // Share of racks fire suppression covers, 0..1.
  suppressionCoverage: (s) => {
    const racks = racksOf(s);
    return racks.length ? racks.filter((b) => isProtectedFromFire(s, b.x, b.y)).length / racks.length : 0;
  },
  firewallBlock: (s) => ddosBlocked(s),
  // 0 until there's that many days of history.
  recentUptime: (s, c) => {
    const u = uptimeOver(s, c.days);
    return u.hours >= u.needed ? u.uptime : 0;
  },
};

// Average uptime over the last `days` of hourly stats samples, with how
// many hours there are and how many a full window needs.
export function uptimeOver(state: GameState, days: number): { uptime: number; hours: number; needed: number } {
  const needed = Math.round(days * 24);
  const samples = state.history.samples.slice(-needed).filter((s) => s.uptime !== undefined);
  const uptime = samples.length ? samples.reduce((sum, s) => sum + s.uptime!, 0) / samples.length : 0;
  return { uptime, hours: samples.length, needed };
}

// Condition types whose values are fractions (shown as percentages).
export const FRACTION_CONDITIONS: ConditionType[] = [
  'renewableShare', 'upsCoverage', 'suppressionCoverage', 'firewallBlock', 'recentUptime',
];

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
  if (condition.type === 'zoneTiles' && !ZONE_KINDS.includes(condition.zone as ZoneKind)) {
    problems.push(`unknown zone "${condition.zone}"`);
  }
  if (FRACTION_CONDITIONS.includes(condition.type) && (condition.min < 0 || condition.min > 1)) {
    problems.push(`${condition.type} min must be between 0 and 1`);
  }
  // Stats history only goes back CONFIG.history.maxSamples hours.
  if (condition.type === 'recentUptime' && !(condition.days > 0 && condition.days * 24 <= CONFIG.history.maxSamples)) {
    problems.push(`recentUptime days must be 1 to ${CONFIG.history.maxSamples / 24}`);
  }
  if (condition.type === 'staffCount' && condition.role !== undefined && !Object.hasOwn(CONFIG.staff.roles, condition.role)) {
    problems.push(`unknown staff role "${condition.role}"`);
  }
  return problems;
}
