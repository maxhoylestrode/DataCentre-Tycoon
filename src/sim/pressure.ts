// Costs and wear that keep a big company from coasting, in a live world:
// - facility overhead: past a number of racks, a per-rack cost that grows
//   faster than the company;
// - corporation tax on each day's profit, in marginal bands;
// - hardware end of life: racks long past their last CPU change or refurbish
//   start failing, more often the older they get;
// - from a high level, clients want stricter, bigger contracts.
// Difficulty scales all of it.

import { CONFIG } from '../config';
import { levelOf } from './progression';
import { nextRandom } from './rng';
import { ageFactor } from './buildings';
import { type Building, type GameState, isRunning, racksOf } from './state';

const P = CONFIG.pressure;

const difficulty = (state: GameState) => CONFIG.difficulty[state.difficulty];

// Facility overhead per tick, for racks that are built (not still waiting for an engineer).
export function overheadPerTick(state: GameState): number {
  if (!state.liveWorld) return 0;
  const racks = racksOf(state).filter((r) => r.status !== 'building').length;
  if (racks <= P.overheadFreeRacks) return 0;
  const extra = racks - P.overheadFreeRacks;
  return extra * P.overheadPerRack * (racks / P.overheadFreeRacks) ** P.overheadExponent * difficulty(state).costs;
}

// Corporation tax on a day's profit.
export function taxFor(state: GameState, dayProfit: number): number {
  if (!state.liveWorld || dayProfit <= 0) return 0;
  const bands = P.taxBands;
  let tax = 0;
  for (let i = 0; i < bands.length; i++) {
    const from = bands[i]!.above;
    const to = bands[i + 1]?.above ?? Infinity;
    if (dayProfit <= from) break;
    tax += (Math.min(dayProfit, to) - from) * bands[i]!.rate;
  }
  return tax * difficulty(state).tax;
}

// Takes tax as the day's profit builds up: each tick, whatever more is owed
// on the day's profit so far (or back, if the day has turned worse). So the
// bands apply to the whole day's profit, but it never lands as one lump.
// Returns the tax taken this tick.
export function chargeTax(state: GameState): number {
  const s = state.progress.stats;
  const owed = taxFor(state, s.dayProfit);
  const delta = owed - s.taxToday;
  state.cash -= delta;
  s.taxToday = owed;
  s.taxPaid += delta;
  return delta;
}

// At midnight: remember the day's tax and start a new day's count.
export function closeTaxDay(state: GameState): void {
  state.progress.stats.lastTax = state.progress.stats.taxToday;
  state.progress.stats.taxToday = 0;
}

// Days a rack has gone since its last CPU change or refurbish.
export function rackAgeDays(state: GameState, rackRefreshed: number): number {
  return Math.max(0, state.tick - rackRefreshed) / CONFIG.time.ticksPerDay;
}

// A rack's hardware condition for the UI: 1 when new, 0 at end of life
// (without a live world, at the ageing floor instead).
export function rackCondition(state: GameState, rack: Building): number {
  if (state.liveWorld) return Math.max(0, 1 - rackAgeDays(state, rack.refreshedAtTick) / P.endOfLifeDays);
  return Math.max(0, (ageFactor(state, rack) - CONFIG.ageing.floor) / (1 - CONFIG.ageing.floor));
}

// A working rack whose hardware is worn enough to be worth replacing.
export const WORN_CONDITION = 0.35;
export function isWorn(state: GameState, rack: Building): boolean {
  return rack.status === 'ok' && rackCondition(state, rack) < WORN_CONDITION;
}

// Chance per game hour this rack fails from old age.
export function endOfLifeChance(state: GameState, rackRefreshed: number): number {
  if (!state.liveWorld) return 0;
  const over = rackAgeDays(state, rackRefreshed) - P.endOfLifeDays;
  return over <= 0 ? 0 : Math.min(P.endOfLifeFailMax, over * P.endOfLifeFailPerDay);
}

// Runs every tick; once an hour, old racks may fail.
export function stepEndOfLife(state: GameState): void {
  if (!state.liveWorld || state.tick % 60 !== 30) return;
  for (const rack of racksOf(state)) {
    if (!isRunning(rack)) continue;
    const chance = endOfLifeChance(state, rack.refreshedAtTick);
    if (chance > 0 && nextRandom(state) < chance) {
      rack.status = 'failed';
      state.progress.stats.failures += 1;
    }
  }
}

// How far into the late game client demands are (0 to lateMaxSteps).
export function lateSteps(state: GameState): number {
  if (!state.liveWorld) return 0;
  return Math.min(P.lateMaxSteps, Math.max(0, (levelOf(state) - P.lateFromLevel) / 10));
}
