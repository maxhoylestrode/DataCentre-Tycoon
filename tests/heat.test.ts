import { describe, expect, it } from 'vitest';
import { testState } from './helpers';
import { CONFIG } from '../src/config';
import { placeBuilding } from '../src/sim/commands';
import { failOverheatedRacks, stepHeat } from '../src/sim/heat';
import { type GameState, getBuildingAt, tempAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';

const H = CONFIG.heat;

function richState(): GameState {
  const state = testState(20, 14);
  state.cash = 1_000_000;
  // Plenty of power so these tests are about heat only.
  for (let x = 0; x < 4; x++) placeBuilding(state, 'power_basic', x, 13);
  return state;
}

function block(state: GameState, x0: number, y0: number, size: number): void {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) placeBuilding(state, 'rack_basic', x, y);
}

function heatSteps(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) stepHeat(state, 1);
}

describe('heat', () => {
  it('an empty room stays at ambient', () => {
    const state = testState(5, 5);
    heatSteps(state, 100);
    expect(state.temps.every((t) => t === H.ambient)).toBe(true);
  });

  it('a running rack warms its tile, and the heat spreads to neighbours', () => {
    const state = testState(9, 9);
    placeBuilding(state, 'rack_basic', 4, 4);
    heatSteps(state, 200);
    const own = tempAt(state, 4, 4);
    const near = tempAt(state, 5, 4);
    const far = tempAt(state, 8, 8);
    expect(own).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(H.ambient);
  });

  it('a failed rack makes no heat', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 2, 2);
    getBuildingAt(state, 2, 2)!.status = 'failed';
    heatSteps(state, 100);
    expect(tempAt(state, 2, 2)).toBe(H.ambient);
  });

  it('a room cools back to ambient once racks are gone', () => {
    const state = testState(9, 9);
    placeBuilding(state, 'rack_basic', 4, 4);
    heatSteps(state, 300);
    state.buildings = [];
    heatSteps(state, 3000);
    expect(tempAt(state, 4, 4)).toBeCloseTo(H.ambient, 1);
  });

  it('a brownout reduces heat output', () => {
    const full = testState(9, 9);
    const brown = testState(9, 9);
    placeBuilding(full, 'rack_basic', 4, 4);
    placeBuilding(brown, 'rack_basic', 4, 4);
    for (let i = 0; i < 200; i++) {
      stepHeat(full, 1);
      stepHeat(brown, 0.5);
    }
    expect(tempAt(brown, 4, 4)).toBeLessThan(tempAt(full, 4, 4));
  });

  it('a cooling unit lowers temperatures within its radius', () => {
    const hot = testState(20, 14);
    const cooled = testState(20, 14);
    cooled.cash = 1_000_000;
    block(hot, 9, 6, 2);
    block(cooled, 9, 6, 2);
    expect(placeBuilding(cooled, 'cooling_fan', 11, 7).ok).toBe(true);
    heatSteps(hot, 500);
    heatSteps(cooled, 500);
    expect(tempAt(cooled, 10, 7)).toBeLessThan(tempAt(hot, 10, 7) - 3);
  });

  it('racks above failTemp fail; racks below do not', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    state.temps[0] = H.failTemp + 0.1;
    state.temps[2] = H.failTemp;
    failOverheatedRacks(state);
    expect(getBuildingAt(state, 0, 0)!.status).toBe('failed');
    expect(getBuildingAt(state, 2, 0)!.status).toBe('ok');
  });
});

// Design intent for Milestone 3: careless layouts break, planned ones don't.
// If balance tuning breaks these, layout has stopped mattering.
describe('heat balance', () => {
  const DAY = CONFIG.time.ticksPerDay;

  it('a lone rack never reaches the warning temperature', () => {
    const state = richState();
    placeBuilding(state, 'rack_basic', 10, 6);
    heatSteps(state, DAY);
    expect(tempAt(state, 10, 6)).toBeLessThan(H.warnTemp);
  });

  it('an uncooled 3x3 block of racks starts failing within a day', () => {
    const state = richState();
    block(state, 9, 5, 3);
    for (let i = 0; i < DAY; i++) tick(state);
    expect(state.buildings.some((b) => b.status === 'failed')).toBe(true);
  });

  it('the same block survives with two cooling units beside it', () => {
    const state = richState();
    block(state, 9, 5, 3);
    placeBuilding(state, 'cooling_fan', 8, 6);
    placeBuilding(state, 'cooling_fan', 12, 6);
    for (let i = 0; i < DAY * 2; i++) tick(state);
    expect(state.buildings.some((b) => b.status === 'failed')).toBe(false);
  });

  it('a repaired rack fails again if its cooling problem is not fixed', () => {
    const state = richState();
    block(state, 9, 5, 3);
    for (let i = 0; i < DAY; i++) tick(state);
    const failed = state.buildings.find((b) => b.status === 'failed')!;
    failed.status = 'repairing';
    failed.repairDoneTick = state.tick + CONFIG.economy.repairTicks;
    for (let i = 0; i < DAY; i++) tick(state);
    expect(failed.status).toBe('failed');
  });
});
