import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { placeBuilding } from '../src/sim/commands';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { UPLINKS } from '../src/sim/content/uplinks';

const B = CONFIG.buildings;
const E = CONFIG.economy;
const DAY = CONFIG.time.ticksPerDay;
// A new, empty game's costs: rent for its one room (after the running-cost
// multiplier) plus the starting internet line's rental.
const RENT = E.rentPerTick * E.runningCostMultiplier + UPLINKS[0]!.rentalPerTick;

function runTicks(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state);
}

// Runs n ticks and returns the lowest cash seen.
function runTracking(state: GameState, n: number): number {
  let lowest = state.cash;
  for (let i = 0; i < n; i++) {
    tick(state);
    lowest = Math.min(lowest, state.cash);
  }
  return lowest;
}

describe('tick', () => {
  it('advances time by one tick', () => {
    const state = createInitialState(5, 5);
    tick(state);
    expect(state.tick).toBe(1);
  });

  it('charges rent with no buildings', () => {
    const state = createInitialState(5, 5);
    runTicks(state, 10);
    expect(state.cash).toBeCloseTo(E.startingCash - 10 * RENT);
  });

  it('allows an overdraft down to the limit', () => {
    const state = createInitialState(5, 5);
    state.cash = -E.overdraftLimit + RENT;
    tick(state);
    expect(state.cash).toBeCloseTo(-E.overdraftLimit);
    expect(state.bankrupt).toBe(false);
  });

  it('past the overdraft limit there is a grace period, then bankruptcy, then it stops', () => {
    const state = createInitialState(5, 5);
    state.cash = -E.overdraftLimit;
    tick(state);
    expect(state.bankrupt).toBe(false);
    expect(state.overdrawnSince).not.toBeNull();
    runTicks(state, E.bankruptcyGraceTicks);
    expect(state.bankrupt).toBe(true);
    const frozen = { tick: state.tick, cash: state.cash };
    runTicks(state, 100);
    expect({ tick: state.tick, cash: state.cash }).toEqual(frozen);
  });

  it('getting back above the limit during the grace period saves the company', () => {
    const state = createInitialState(5, 5);
    state.cash = -E.overdraftLimit - 100;
    runTicks(state, E.bankruptcyGraceTicks / 2);
    state.cash = 1000;
    tick(state);
    expect(state.overdrawnSince).toBeNull();
    state.cash = -E.overdraftLimit - 100;
    runTicks(state, E.bankruptcyGraceTicks - 2);
    expect(state.bankrupt).toBe(false);
  });

  it('a repairing rack comes back online after repairTicks', () => {
    const state = createInitialState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    rack.status = 'repairing';
    rack.repairDoneTick = E.repairTicks;
    runTicks(state, E.repairTicks);
    expect(rack.status).toBe('repairing');
    tick(state);
    expect(rack.status).toBe('ok');
    expect(rack.repairDoneTick).toBeNull();
  });
});

// Design intent: a sensible start is comfortably profitable, but spending
// every penny on day 1 ruins you. If balance tuning breaks these, it has
// made the game either impossible or pressure-free.
describe('balance', () => {
  const maxAffordable = Math.floor(E.startingCash / B.rack_basic.cost);
  const racksOnBasePower = Math.floor(CONFIG.power.baseSupply / B.rack_basic.powerDraw);

  it('one full rack more than covers its upkeep and the rent', () => {
    expect(B.rack_basic.incomePerTick - B.rack_basic.upkeepPerTick).toBeGreaterThan(E.rentPerTick * 2);
  });

  // Was 2 days; electricity and the internet line make the start a little slower.
  it('a single rack never goes negative and pays for itself within 3 days', () => {
    const state = createInitialState(10, 10);
    placeBuilding(state, 'rack_basic', 5, 5);
    expect(runTracking(state, DAY * 3)).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThan(E.startingCash);
  });

  it('spaced-out racks on base power run safely and turn a profit', () => {
    const state = createInitialState(20, 14);
    for (let i = 0; i < racksOnBasePower; i++) placeBuilding(state, 'rack_basic', 2 + i * 4, 6);
    const afterBuying = state.cash;
    expect(runTracking(state, DAY * 3)).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThan(afterBuying);
    expect(state.buildings.every((b) => b.status === 'ok')).toBe(true);
  });

  it('spending all starting cash on racks bankrupts you within the first day', () => {
    const state = createInitialState(10, 10);
    for (let i = 0; i < maxAffordable; i++) placeBuilding(state, 'rack_basic', i, 0);
    runTicks(state, DAY);
    expect(state.bankrupt).toBe(true);
  });
});
