import { describe, expect, it } from 'vitest';
import { testState } from './helpers';
import { CONFIG } from '../src/config';
import { applyEconomy, costsPerTick, incomePerTick, netIncomePerTick, rackFill } from '../src/sim/economy';
import { placeBuilding } from '../src/sim/commands';
import { getBuildingAt } from '../src/sim/state';

const B = CONFIG.buildings;
const E = CONFIG.economy;

describe('economy', () => {
  it('a new rack ramps from empty to full over rackRampTicks', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = state.buildings[0]!;

    expect(rackFill(state, rack)).toBe(0);
    state.tick = E.rackRampTicks / 2;
    expect(rackFill(state, rack)).toBeCloseTo(0.5);
    state.tick = E.rackRampTicks;
    expect(rackFill(state, rack)).toBe(1);
    state.tick = E.rackRampTicks * 10;
    expect(rackFill(state, rack)).toBe(1);
  });

  it('income scales with each rack’s fill', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    state.tick = E.rackRampTicks;
    placeBuilding(state, 'rack_basic', 2, 0);
    // First rack full, second just built.
    expect(incomePerTick(state)).toBeCloseTo(B.rack_basic.incomePerTick);
  });

  it('failed and repairing racks earn nothing', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    state.tick = E.rackRampTicks;
    getBuildingAt(state, 0, 0)!.status = 'failed';
    getBuildingAt(state, 2, 0)!.status = 'repairing';
    expect(incomePerTick(state)).toBe(0);
  });

  it('costs are rent plus upkeep for every building, working or not', () => {
    const state = testState(5, 5);
    state.cash = 100_000;
    const m = E.runningCostMultiplier;
    expect(costsPerTick(state)).toBeCloseTo(E.rentPerTick * m);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'power_basic', 1, 0);
    placeBuilding(state, 'cooling_fan', 2, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    expect(costsPerTick(state)).toBeCloseTo(
      (E.rentPerTick + B.rack_basic.upkeepPerTick + B.power_basic.upkeepPerTick + B.cooling_fan.upkeepPerTick) * m,
    );
  });

  it('applyEconomy adds net income to cash', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    state.tick = E.rackRampTicks;
    const before = state.cash;
    const net = netIncomePerTick(state);
    applyEconomy(state);
    expect(state.cash).toBeCloseTo(before + net);
  });
});
