import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildingStats, investedValue, upgradeCost } from '../src/sim/buildings';
import { placeBuilding, sellBuilding, upgradeBuilding } from '../src/sim/commands';
import { powerDraw, powerSupply } from '../src/sim/power';
import { totalXpForLevel, upgradeCap } from '../src/sim/progression';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';

// Levels are for power and cooling units; racks upgrade through parts (parts.test.ts).
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

describe('upgrade levels', () => {
  it('power units get 15% stronger per level; cooling units too, but draw more power', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'cooling_fan', 2, 0);
    const supplyBefore = powerSupply(state);
    const drawBefore = powerDraw(state);
    upgradeTimes(state, 0, 0, 2);
    upgradeTimes(state, 2, 0, 2);
    expect(powerSupply(state)).toBeCloseTo(supplyBefore + 2 * B.power_basic.powerSupply * B.power_basic.upgrade.output);
    expect(powerDraw(state)).toBeCloseTo(drawBefore + 2 * B.cooling_fan.powerDraw * B.cooling_fan.upgrade.powerDraw);
    expect(buildingStats(getBuildingAt(state, 2, 0)!).coolingStrength).toBeCloseTo(
      B.cooling_fan.coolingStrength * (1 + 2 * B.cooling_fan.upgrade.output),
    );
  });

  it('racks and decorations do not use levels', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'plant_small', 2, 0);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'use_parts' });
    expect(upgradeBuilding(state, 2, 0)).toEqual({ ok: false, reason: 'not_upgradable' });
  });

  it('each level costs more than the last', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 0, 0);
    const unit = getBuildingAt(state, 0, 0)!;
    expect(upgradeCost(unit, 0)).toBe(Math.round((B.power_basic.cost * U.firstCostFraction * U.costMultiplier) / 10) * 10);
    for (let l = 1; l < U.maxLevel; l++) expect(upgradeCost(unit, l)).toBeGreaterThan(upgradeCost(unit, l - 1));
  });

  it('charges the cost and raises the level', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'power_basic', 0, 0);
    const unit = getBuildingAt(state, 0, 0)!;
    const cash = state.cash;
    const cost = upgradeCost(unit);
    upgradeBuilding(state, 0, 0);
    expect(unit.upgrade).toBe(1);
    expect(state.cash).toBe(cash - cost);
    expect(state.progress.stats.upgrades).toBe(1);
  });

  it('is locked at level 1, then capped at your level', () => {
    const state = stateAtLevel(1);
    state.progress.xp = totalXpForLevel(2);
    placeBuilding(state, 'power_basic', 0, 0);
    state.progress.xp = 0;
    expect(upgradeCap(state)).toBe(0);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });

    state.progress.xp = totalXpForLevel(3);
    expect(upgradeCap(state)).toBe(3);
    upgradeTimes(state, 0, 0, 3);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });
  });

  it('never goes past the hard max, however high your level', () => {
    const state = stateAtLevel(50);
    placeBuilding(state, 'cooling_fan', 0, 0);
    expect(upgradeCap(state)).toBe(U.maxLevel);
    upgradeTimes(state, 0, 0, U.maxLevel);
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'at_cap' });
  });

  it('needs enough cash', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'power_basic', 0, 0);
    state.cash = upgradeCost(getBuildingAt(state, 0, 0)!) - 1;
    expect(upgradeBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('selling refunds part of the purchase price and every upgrade', () => {
    const state = stateAtLevel(5);
    placeBuilding(state, 'power_basic', 0, 0);
    upgradeTimes(state, 0, 0, 3);
    const unit = getBuildingAt(state, 0, 0)!;
    const invested = investedValue(unit);
    expect(invested).toBe(B.power_basic.cost + upgradeCost(unit, 0) + upgradeCost(unit, 1) + upgradeCost(unit, 2));
    const cash = state.cash;
    sellBuilding(state, 0, 0);
    expect(state.cash).toBeCloseTo(cash + invested * CONFIG.economy.sellRefund);
  });
});
