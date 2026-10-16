import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { cancelContract, placeBuilding, signContract } from '../src/sim/commands';
import { availableCustomerTypes, contractBoardOpen, refreshOffers, rollOffer } from '../src/sim/contractBoard';
import { committedRacks, freeRacks, uptimeOf } from '../src/sim/contracts';
import { CUSTOMER_TYPES } from '../src/sim/content/customers';
import { incomeBreakdown } from '../src/sim/economy';
import { totalXpForLevel } from '../src/sim/progression';
import { nextRandom, randomInt } from '../src/sim/rng';
import { type ContractTerms, createInitialState, type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';

const DAY = CONFIG.time.ticksPerDay;
const BOARD_LEVEL = 6;

// A level-6 game with plenty of cash, power and racks spread out so heat
// never interferes.
function boardState(racks = 4, seed = 1): GameState {
  const state = createInitialState(20, 14, seed);
  state.cash = 1_000_000;
  state.progress.xp = totalXpForLevel(BOARD_LEVEL);
  placeBuilding(state, 'power_basic', 19, 13);
  placeBuilding(state, 'power_basic', 18, 13);
  for (let i = 0; i < racks; i++) placeBuilding(state, 'rack_basic', 1 + (i % 5) * 4, 1 + Math.floor(i / 5) * 4);
  return state;
}

// Puts a known offer on the board and returns its id.
function offer(state: GameState, terms: Partial<ContractTerms> = {}): number {
  const o: ContractTerms = {
    id: state.contracts.nextId++,
    customerType: 'startup',
    name: 'Test Ltd',
    racks: 2,
    days: 1,
    payPerRackPerTick: 4,
    sla: 0.95,
    bonus: 1000,
    penalty: 2000,
    xp: 100,
    ...terms,
  };
  state.contracts.offers.push(o);
  return o.id;
}

function runTicks(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state);
}

describe('rng', () => {
  it('is repeatable for the same seed and differs between seeds', () => {
    const a = createInitialState(5, 5, 42);
    const b = createInitialState(5, 5, 42);
    const c = createInitialState(5, 5, 43);
    const roll = (s: GameState): number[] => Array.from({ length: 5 }, () => nextRandom(s));
    const ra = roll(a);
    expect(roll(b)).toEqual(ra);
    expect(roll(c)).not.toEqual(ra);
    for (const r of ra) expect(r >= 0 && r < 1).toBe(true);
  });

  it('randomInt covers both ends of its range', () => {
    const state = createInitialState(5, 5, 7);
    const seen = new Set(Array.from({ length: 200 }, () => randomInt(state, 1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('contract board', () => {
  it('is closed before level 6 and opens at it', () => {
    const state = createInitialState(10, 10);
    expect(contractBoardOpen(state)).toBe(false);
    refreshOffers(state);
    expect(state.contracts.offers).toEqual([]);
    state.progress.xp = totalXpForLevel(BOARD_LEVEL);
    expect(contractBoardOpen(state)).toBe(true);
  });

  it('offers a fresh set once per day', () => {
    const state = boardState();
    refreshOffers(state);
    const first = state.contracts.offers.map((o) => o.id);
    expect(first).toHaveLength(CONFIG.contracts.offersPerDay);
    refreshOffers(state);
    expect(state.contracts.offers.map((o) => o.id)).toEqual(first);
    runTicks(state, DAY);
    expect(state.contracts.offers.map((o) => o.id)).not.toEqual(first);
  });

  it('the same seed gives the same offers', () => {
    const a = boardState(4, 99);
    const b = boardState(4, 99);
    refreshOffers(a);
    refreshOffers(b);
    expect(a.contracts.offers).toEqual(b.contracts.offers);
  });

  it('only offers customer types the level allows', () => {
    expect(availableCustomerTypes(BOARD_LEVEL).every((t) => t.minLevel <= BOARD_LEVEL)).toBe(true);
    const state = boardState();
    for (let day = 0; day < 20; day++) {
      runTicks(state, DAY);
      const allowed = new Set(availableCustomerTypes(BOARD_LEVEL + 1).map((t) => t.id));
      for (const o of state.contracts.offers) expect(allowed.has(o.customerType)).toBe(true);
    }
  });

  it('rolled terms stay inside the customer type ranges', () => {
    const state = boardState();
    for (const type of CUSTOMER_TYPES) {
      for (let i = 0; i < 50; i++) {
        const o = rollOffer(state, type);
        expect(o.racks).toBeGreaterThanOrEqual(type.racks[0]);
        expect(o.racks).toBeLessThanOrEqual(type.racks[1]);
        expect(o.days).toBeGreaterThanOrEqual(type.days[0]);
        expect(o.days).toBeLessThanOrEqual(type.days[1]);
        expect(o.sla).toBeGreaterThanOrEqual(type.sla[0] - 0.005);
        expect(o.sla).toBeLessThanOrEqual(Math.min(1, type.sla[1] + 0.005));
        expect(o.penalty).toBeGreaterThanOrEqual(0);
        expect(o.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('signing', () => {
  it('moves the offer into active contracts', () => {
    const state = boardState();
    const id = offer(state, { racks: 2, days: 3 });
    expect(signContract(state, id)).toEqual({ ok: true });
    expect(state.contracts.offers.find((o) => o.id === id)).toBeUndefined();
    const c = state.contracts.active[0]!;
    expect(c.endTick - c.startTick).toBe(3 * DAY);
    expect(committedRacks(state)).toBe(2);
    expect(freeRacks(state)).toBe(2);
    expect(state.progress.stats.contractsSigned).toBe(1);
  });

  it('needs enough uncommitted racks', () => {
    const state = boardState(3);
    signContract(state, offer(state, { racks: 2 }));
    expect(signContract(state, offer(state, { racks: 2 }))).toEqual({ ok: false, reason: 'not_enough_racks' });
  });

  it('is locked before level 6', () => {
    const state = createInitialState(10, 10);
    expect(signContract(state, offer(state))).toEqual({ ok: false, reason: 'locked' });
  });

  it('rejects unknown offers', () => {
    expect(signContract(boardState(), 999)).toEqual({ ok: false, reason: 'no_offer' });
  });
});

describe('serving contracts', () => {
  it('contracted racks earn the contract rate with no ramp-up; the rest earn walk-in', () => {
    const state = boardState(4);
    signContract(state, offer(state, { racks: 2, payPerRackPerTick: 4 }));
    const income = incomeBreakdown(state);
    expect(income.contracts).toBeCloseTo(2 * 4);
    expect(income.allocation.walkIn).toHaveLength(2);
  });

  it('contracts take the newest racks and leave ramped-up racks on walk-in', () => {
    const state = boardState(2);
    runTicks(state, 100);
    placeBuilding(state, 'rack_basic', 10, 10);
    signContract(state, offer(state, { racks: 1 }));
    const { allocation } = incomeBreakdown(state);
    expect(allocation.walkIn.map((b) => b.builtAtTick)).toEqual([0, 0]);
  });

  it('full service gives 100% uptime and pays bonus and XP at the end', () => {
    const state = boardState(4);
    signContract(state, offer(state, { racks: 2, days: 1, bonus: 1000, xp: 100 }));
    const cashBefore = state.cash;
    const xpBefore = state.progress.xp;
    runTicks(state, DAY);
    expect(state.contracts.active).toHaveLength(0);
    const result = state.contracts.history.at(-1)!;
    expect(result.outcome).toBe('completed');
    expect(result.uptime).toBeCloseTo(1);
    expect(state.progress.stats.contractsCompleted).toBe(1);
    expect(state.progress.stats.perfectContracts).toBe(1);
    expect(state.progress.xp).toBeGreaterThanOrEqual(xpBefore + 100);
    // Earned a day of contract pay plus the bonus (minus running costs).
    expect(state.cash).toBeGreaterThan(cashBefore + 1000);
  });

  it('failed racks count as downtime and can break the promise', () => {
    const state = boardState(2);
    signContract(state, offer(state, { racks: 2, days: 1, sla: 0.9, penalty: 2000 }));
    getBuildingAt(state, 1, 1)!.status = 'failed';
    runTicks(state, DAY);
    const result = state.contracts.history.at(-1)!;
    expect(result.outcome).toBe('failed');
    expect(result.uptime).toBeCloseTo(0.5, 2);
    expect(result.cash).toBe(-2000);
    expect(state.progress.stats.contractsFailed).toBe(1);
    expect(state.progress.achievements).toContain('broken_promise');
  });

  it('a brownout counts as partial downtime', () => {
    const state = boardState(0);
    // Sell the power units: 4 racks on base power alone is a brownout.
    state.buildings = [];
    for (let i = 0; i < 4; i++) placeBuilding(state, 'rack_basic', 1 + i * 4, 1);
    signContract(state, offer(state, { racks: 4, days: 1 }));
    runTicks(state, 10);
    const efficiency = CONFIG.power.baseSupply / (4 * CONFIG.buildings.rack_basic.powerDraw);
    expect(uptimeOf(state.contracts.active[0]!)).toBeCloseTo(efficiency);
  });

  it('a short dip can be made up if overall uptime stays above the promise', () => {
    const state = boardState(2);
    signContract(state, offer(state, { racks: 2, days: 1, sla: 0.95 }));
    const rack = getBuildingAt(state, 1, 1)!;
    rack.status = 'repairing';
    rack.repairDoneTick = 60; // one rack down for an hour: 60 of 2880 rack-minutes
    runTicks(state, DAY);
    expect(state.contracts.history.at(-1)!.outcome).toBe('completed');
  });

  it('cancelling ends the contract and charges the penalty', () => {
    const state = boardState(2);
    signContract(state, offer(state, { penalty: 1500 }));
    const id = state.contracts.active[0]!.id;
    const cash = state.cash;
    expect(cancelContract(state, id)).toEqual({ ok: true });
    expect(state.contracts.active).toHaveLength(0);
    expect(state.cash).toBe(cash - 1500);
    expect(state.contracts.history.at(-1)!.outcome).toBe('cancelled');
    expect(cancelContract(state, id)).toEqual({ ok: false, reason: 'no_contract' });
  });

  it('keeps only the most recent results in history', () => {
    const state = boardState(2);
    for (let i = 0; i < CONFIG.contracts.historyLength + 3; i++) {
      signContract(state, offer(state, { racks: 1 }));
      cancelContract(state, state.contracts.active[0]!.id);
    }
    expect(state.contracts.history).toHaveLength(CONFIG.contracts.historyLength);
  });
});
