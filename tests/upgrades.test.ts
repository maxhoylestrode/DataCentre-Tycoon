import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildingStats, investedValue, upgradeCost } from '../src/sim/buildings';
import { placeBuilding, sellBuilding, upgradeBuilding } from '../src/sim/commands';
import { incomeBreakdown } from '../src/sim/economy';
import { powerDraw, powerSupply } from '../src/sim/power';
import { totalXpForLevel, upgradeCap } from '../src/sim/progression';
import { createInitialState, type GameState, getBuildingAt, tempAt } from '../src/sim/state';
import { stepHeat } from '../src/sim/heat';

const B = CONFIG.buildings;
const U = CONFIG.upgrades;

function stateAtLevel(level: number): GameState {
  const state = createInitialState(12, 10);
  state.cash = 10_000_000;
  state.progress.xp = totalXpForLevel(level);
  return state;
}

function upgradeTimes(state: GameState, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) expect(upgradeBuilding(state, x, y)).toEqual({ ok: true });
}

describe('upgrade stats', () => {
  it('a rack earns 15% more per level but also draws more power and makes more heat', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    const base = buildingStats(rack);
    upgradeTimes(state, 0, 0, 4);
    const up = buildingStats(rack);
    expect(up.income).toBeCloseTo(base.income * (1 + 4 * B.rack_basic.upgrade.output));
    expect(up.powerDraw).toBeGreaterThan(base.powerDraw);
    expect(up.heat).toBeGreaterThan(base.heat);
    // The upside outgrows the downside.
    expect(up.income / base.income).toBeGreaterThan(up.powerDraw / base.powerDraw);
  });

  it('power and cooling units just get stronger', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'cooling_fan', 2, 0);
    const supplyBefore = powerSupply(state);
    const drawBefore = powerDraw(state);
    upgradeTimes(state, 0, 0, 2);
    upgradeTimes(state, 2, 0, 2);
    expect(powerSupply(state)).toBeCloseTo(supplyBefore + 2 * B.power_basic.powerSupply * B.power_basic.upgrade.output);
    expect(powerDraw(state)).toBe(drawBefore);
    const cooler = getBuildingAt(state, 2, 0)!;
    expect(buildingStats(cooler).coolingStrength).toBeGreaterThan(B.cooling_fan.coolingStrength);
  });

  it('upgraded racks earn more walk-in income', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    state.tick = CONFIG.economy.rackRampTicks;
    const before = incomeBreakdown(state).walkIn;
    upgradeTimes(state, 0, 0, 3);
    expect(incomeBreakdown(state).walkIn).toBeCloseTo(before * (1 + 3 * B.rack_basic.upgrade.output));
  });

  it('upgraded racks run hotter', () => {
    const plain = stateAtLevel(10);
    const upgraded = stateAtLevel(10);
    for (const s of [plain, upgraded]) placeBuilding(s, 'rack_basic', 5, 5);
    upgradeTimes(upgraded, 5, 5, 10);
    for (let i = 0; i < 300; i++) {
      stepHeat(plain, 1);
      stepHeat(upgraded, 1);
    }
    expect(tempAt(upgraded, 5, 5)).toBeGreaterThan(tempAt(plain, 5, 5));
  });

  it('each level costs more than the last', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    expect(upgradeCost(rack, 0)).toBe(B.rack_basic.cost * U.firstCostFraction);
    for (let l = 1; l < U.maxLevel; l++) expect(upgradeCost(rack, l)).toBeGreaterThan(upgradeCost(rack, l - 1));
  });
});

describe('upgrading', () => {
  it('charges the cost and raises the level', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    const cash = state.cash;
    const cost = upgradeCost(rack);
    upgradeBuilding(state, 0, 0);
    expect(rack.upgrade).toBe(1);
    expect(state.cash).toBe(cash - cost);
    expect(state.progress.stats.upgrades).toBe(1);
  });

  it('is locked at level 1, then capped at your level', () => {
    const state = stateAtLevel(1);
    placeBuilding(state, 'rack_basic', 0, 0);
    expect(upgradeCap(state)).toBe(0);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });

    state.progress.xp = totalXpForLevel(3);
    expect(upgradeCap(state)).toBe(3);
    upgradeTimes(state, 0, 0, 3);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });
  });

  it('never goes past the hard max, however high your level', () => {
    const state = stateAtLevel(50);
    placeBuilding(state, 'rack_basic', 0, 0);
    expect(upgradeCap(state)).toBe(U.maxLevel);
    upgradeTimes(state, 0, 0, U.maxLevel);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });
  });

  it('needs enough cash', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'rack_basic', 0, 0);
    state.cash = upgradeCost(getBuildingAt(state, 0, 0)!) - 1;
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('a failed rack must be repaired first', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'rack_basic', 0, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'not_working' });
  });

  it('selling refunds part of the purchase price and every upgrade', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'rack_basic', 0, 0);
    upgradeTimes(state, 0, 0, 3);
    const invested = investedValue(getBuildingAt(state, 0, 0)!);
    expect(invested).toBe(B.rack_basic.cost + upgradeCost(getBuildingAt(state, 0, 0)!, 0) +
      upgradeCost(getBuildingAt(state, 0, 0)!, 1) + upgradeCost(getBuildingAt(state, 0, 0)!, 2));
    const cash = state.cash;
    sellBuilding(state, 0, 0);
    expect(state.cash).toBeCloseTo(cash + invested * CONFIG.economy.sellRefund);
  });

  it('contracts use the least valuable racks, leaving upgraded ones on walk-in', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 9, 9);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    state.tick = CONFIG.economy.rackRampTicks;
    upgradeTimes(state, 2, 0, 5);
    state.contracts.active.push({
      id: 1, customerType: 'startup', name: 'A', racks: 1, days: 1, payPerRackPerTick: 4, sla: 0.9,
      bonus: 0, penalty: 0, xp: 0, startTick: state.tick, endTick: state.tick + 1440,
      servedRackTicks: 0, promisedRackTicks: 0,
    });
    const { allocation } = incomeBreakdown(state);
    expect(allocation.walkIn.map((b) => b.upgrade)).toEqual([5]);
  });
});
