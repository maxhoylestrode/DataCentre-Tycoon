import { describe, expect, it } from 'vitest';
import { testState } from './helpers';
import { CONFIG } from '../src/config';
import { placeBuilding } from '../src/sim/commands';
import { incomePerTick } from '../src/sim/economy';
import { powerDraw, powerEfficiency, powerSupply } from '../src/sim/power';
import { type GameState, getBuildingAt } from '../src/sim/state';

const B = CONFIG.buildings;

function richState(): GameState {
  const state = testState(10, 10);
  state.cash = 1_000_000;
  return state;
}

describe('power', () => {
  it('supply is the base supply plus every power unit', () => {
    const state = richState();
    expect(powerSupply(state)).toBe(CONFIG.power.baseSupply);
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'power_basic', 1, 0);
    expect(powerSupply(state)).toBe(CONFIG.power.baseSupply + 2 * B.power_basic.powerSupply);
  });

  it('racks and cooling units draw power', () => {
    const state = richState();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'cooling_fan', 1, 0);
    expect(powerDraw(state)).toBe(B.rack_basic.powerDraw + B.cooling_fan.powerDraw);
  });

  it('failed and repairing racks draw nothing', () => {
    const state = richState();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 1, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    getBuildingAt(state, 1, 0)!.status = 'repairing';
    expect(powerDraw(state)).toBe(0);
  });

  it('efficiency is 1 while supply covers draw', () => {
    const state = richState();
    expect(powerEfficiency(state)).toBe(1);
    placeBuilding(state, 'rack_basic', 0, 0);
    expect(powerEfficiency(state)).toBe(1);
  });

  it('base supply alone cannot run an unlimited number of racks', () => {
    const racksOnBase = Math.floor(CONFIG.power.baseSupply / B.rack_basic.powerDraw);
    expect(racksOnBase).toBeGreaterThanOrEqual(1);
    const state = richState();
    for (let i = 0; i <= racksOnBase; i++) placeBuilding(state, 'rack_basic', i * 2, 0);
    expect(powerEfficiency(state)).toBeLessThan(1);
  });

  it('overload browns out every rack by supply / draw', () => {
    const state = richState();
    const count = Math.ceil(CONFIG.power.baseSupply / B.rack_basic.powerDraw) + 2;
    for (let i = 0; i < count; i++) placeBuilding(state, 'rack_basic', i, 2);
    state.tick = CONFIG.economy.rackRampTicks;
    // Fresh hardware, so ageing doesn't blur the brownout maths.
    for (const b of state.buildings) b.refreshedAtTick = state.tick;

    const efficiency = CONFIG.power.baseSupply / (count * B.rack_basic.powerDraw);
    expect(powerEfficiency(state)).toBeCloseTo(efficiency);
    expect(incomePerTick(state)).toBeCloseTo(count * CONFIG.buildings.rack_basic.incomePerTick * efficiency);

    placeBuilding(state, 'power_basic', 0, 5);
    expect(powerEfficiency(state)).toBe(1);
  });
});
