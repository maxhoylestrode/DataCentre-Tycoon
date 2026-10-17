import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { hireStaff, placeBuilding, placeWall, setAutoSign } from '../src/sim/commands';
import { refreshOffers, rollOffer } from '../src/sim/contractBoard';
import { CUSTOMER_TYPES } from '../src/sim/content/customers';
import { deskFront } from '../src/sim/people';
import { totalXpForLevel } from '../src/sim/progression';
import { incomeBreakdown } from '../src/sim/economy';
import { incomeWithOffer, managersAtDesks, salesExtraOffers, salesPayBonus } from '../src/sim/sales';
import { deserialize, serialize } from '../src/sim/save';
import { type ContractTerms, createInitialState, type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { fastNetwork } from './helpers';

function game(level = 20): GameState {
  const state = createInitialState(20, 14, 1, { staffSim: true });
  state.cash = 10_000_000;
  state.progress.xp = totalXpForLevel(level);
  fastNetwork(state);
  return state;
}

function runUntil(state: GameState, done: () => boolean, max = 5000): void {
  for (let i = 0; i < max; i++) {
    if (done()) return;
    tick(state);
  }
  throw new Error('took too long');
}

// A reception desk facing north, a front door, power and four built racks.
function office(state: GameState): void {
  placeBuilding(state, 'desk_reception', 10, 10, 2);
  placeWall(state, 'door_outside', 10, 14, 'h');
  placeBuilding(state, 'power_basic', 0, 0);
  for (let i = 0; i < 4; i++) placeBuilding(state, 'rack_basic', 2 + i * 2, 3);
  runUntil(state, () => state.buildings.every((b) => b.status === 'ok'));
}

// A client waiting at reception with an offer on the given terms.
function waitingOffer(state: GameState, terms: Partial<ContractTerms>): ContractTerms {
  const offer = { ...rollOffer(state, CUSTOMER_TYPES[0]!), sla: 0.9, racks: 2, ...terms, arrived: true };
  delete offer.requirement;
  state.contracts.offers.push(offer);
  return offer;
}

describe('account managers', () => {
  it('unlock at their level', () => {
    const state = game(CONFIG.staff.roles.account_manager.minLevel - 1);
    expect(hireStaff(state, 'account_manager')).toEqual({ ok: false, reason: 'locked' });
    state.progress.xp = totalXpForLevel(CONFIG.staff.roles.account_manager.minLevel);
    expect(hireStaff(state, 'account_manager').ok).toBe(true);
  });

  it('walk to a reception desk and stand beside it, not in the clients’ spot', () => {
    const state = game();
    office(state);
    hireStaff(state, 'account_manager');
    runUntil(state, () => managersAtDesks(state).length === 1);
    const m = managersAtDesks(state)[0]!;
    const desk = getBuildingAt(state, 10, 10)!;
    const at = [Math.round(m.x), Math.round(m.y)];
    expect(Math.abs(at[0]! - desk.x) + Math.abs(at[1]! - desk.y)).toBe(1);
    expect(at).not.toEqual(deskFront(desk));
  });

  it('only one manager per desk', () => {
    const state = game();
    office(state);
    hireStaff(state, 'account_manager');
    hireStaff(state, 'account_manager');
    for (let i = 0; i < 400; i++) tick(state);
    expect(managersAtDesks(state)).toHaveLength(1);
  });

  it('talk to a waiting client, then sign a good contract for you', () => {
    const state = game();
    office(state);
    hireStaff(state, 'account_manager');
    runUntil(state, () => managersAtDesks(state).length === 1);
    const offer = waitingOffer(state, { payPerRackPerTick: 50 });
    tick(state);
    expect(managersAtDesks(state)[0]!.task!.offerId).toBe(offer.id);
    runUntil(state, () => state.contracts.active.length === 1, CONFIG.staff.sales.negotiateTicks * 3);
    expect(state.contracts.active[0]).toMatchObject({ id: offer.id, signedByStaff: true });
    expect(state.contracts.active[0]!.review).toBeUndefined();
    expect(state.progress.stats.staffSigned).toBe(1);
  });

  it('turn down offers you can’t keep, saying why', () => {
    const state = game();
    office(state);
    hireStaff(state, 'account_manager');
    runUntil(state, () => managersAtDesks(state).length === 1);
    const tooBig = waitingOffer(state, { racks: 10, payPerRackPerTick: 50 });
    const tooStrict = waitingOffer(state, { sla: 1, payPerRackPerTick: 50 });
    const cheap = waitingOffer(state, { payPerRackPerTick: 0.01 });
    runUntil(state, () => [tooBig, tooStrict, cheap].every((o) => o.review), 500);
    expect(state.contracts.active).toHaveLength(0);
    expect(tooBig.review).toMatchObject({ recommend: false, note: expect.stringMatching(/racks/) });
    expect(tooStrict.review).toMatchObject({ recommend: false, note: expect.stringMatching(/uptime/) });
    expect(cheap.review).toMatchObject({ recommend: false, note: expect.stringMatching(/income would drop/) });
  });

  it('with signing off, only advise', () => {
    const state = game();
    office(state);
    setAutoSign(state, false);
    hireStaff(state, 'account_manager');
    runUntil(state, () => managersAtDesks(state).length === 1);
    const offer = waitingOffer(state, { payPerRackPerTick: 50 });
    runUntil(state, () => offer.review !== undefined, 500);
    expect(offer.review!.recommend).toBe(true);
    expect(state.contracts.active).toHaveLength(0);
  });
});

describe('judging an offer', () => {
  it('counts the walk-in racks left over earning more once the market is less crowded', () => {
    // Engine game (no staff): racks are built instantly.
    const state = createInitialState(20, 14);
    state.cash = 10_000_000;
    state.progress.xp = totalXpForLevel(20);
    fastNetwork(state);
    for (let i = 0; i < 2 * CONFIG.market.freeRacks; i++) placeBuilding(state, 'rack_basic', i % 20, 1 + 2 * Math.floor(i / 20));
    for (const b of state.buildings) b.builtAtTick = -CONFIG.economy.rackRampTicks;
    for (let i = 0; i < 3; i++) placeBuilding(state, 'power_basic', i, 9);
    const income = incomeBreakdown(state);
    // Contract pay is scaled by efficiency when earned, so compare like with like.
    const average = income.walkIn / income.allocation.walkIn.length / income.efficiency;
    expect(income.market).toBeLessThan(1);
    // Pays a little under the average walk-in rack, but the rest earn more without those racks.
    const offer = { ...rollOffer(state, CUSTOMER_TYPES[0]!), racks: 10, payPerRackPerTick: average * 0.9 };
    delete offer.requirement;
    const { before, after } = incomeWithOffer(state, offer);
    expect(after).toBeGreaterThan(before);
    expect(state.contracts.active).toHaveLength(0);
  });
});

describe('sales reps', () => {
  it('bring more clients and better pay, up to a cap', () => {
    const state = game();
    const before = CONFIG.contracts.offersPerDay;
    for (let i = 0; i < 2; i++) hireStaff(state, 'sales_rep');
    expect(salesExtraOffers(state)).toBe(2 * CONFIG.staff.sales.offersPerRep);
    expect(salesPayBonus(state)).toBeCloseTo(2 * CONFIG.staff.sales.payPerRep);
    state.contracts.offersDay = 0;
    refreshOffers(state);
    expect(state.contracts.offers.length).toBeGreaterThanOrEqual(before + 2);
    for (let i = 0; i < 20; i++) hireStaff(state, 'sales_rep');
    expect(salesExtraOffers(state)).toBe(CONFIG.staff.sales.maxExtraOffers);
    expect(salesPayBonus(state)).toBe(CONFIG.staff.sales.maxPayBonus);
  });
});

describe('saving sales', () => {
  it('round-trips the auto-sign switch, reviews and staff-signed contracts', () => {
    const state = game();
    setAutoSign(state, false);
    hireStaff(state, 'account_manager');
    const offer = waitingOffer(state, {});
    offer.review = { recommend: false, note: 'Not enough racks free.' };
    const loaded = deserialize(serialize(state));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.contracts.autoSign).toBe(false);
    expect(loaded.state.contracts.offers.find((o) => o.id === offer.id)?.review).toEqual(offer.review);
    expect(loaded.state.staff.map((m) => m.role)).toContain('account_manager');
  });
});
