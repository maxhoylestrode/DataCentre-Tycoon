import { describe, expect, it } from 'vitest';
import { testState } from './helpers';
import { CONFIG } from '../src/config';
import { getBuildingAt } from '../src/sim/state';
import { placeBuilding, repairRack, sellBuilding } from '../src/sim/commands';
import { repairCost } from '../src/sim/economy';

const B = CONFIG.buildings;
const E = CONFIG.economy;

describe('placing buildings', () => {
  it('places a rack on an empty tile', () => {
    const state = testState(5, 5);
    expect(placeBuilding(state, 'rack_basic', 2, 3)).toEqual({ ok: true });
    expect(state.buildings).toHaveLength(1);
    expect(getBuildingAt(state, 2, 3)).toMatchObject({ kind: 'rack_basic', x: 2, y: 3, status: 'ok' });
  });

  it('places every kind of building and deducts its cost', () => {
    const state = testState(5, 5);
    state.cash = 100_000;
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'power_basic', 1, 0);
    placeBuilding(state, 'cooling_fan', 2, 0);
    expect(state.buildings.map((b) => b.kind)).toEqual(['rack_basic', 'power_basic', 'cooling_fan']);
    expect(state.cash).toBe(100_000 - B.rack_basic.cost - B.power_basic.cost - B.cooling_fan.cost);
  });

  it('gives each building a unique id', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 1, 0);
    expect(new Set(state.buildings.map((b) => b.id)).size).toBe(2);
  });

  it('records the build tick', () => {
    const state = testState(5, 5);
    state.tick = 42;
    placeBuilding(state, 'rack_basic', 0, 0);
    expect(state.buildings[0]?.builtAtTick).toBe(42);
  });

  it('rejects placing on an occupied tile', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 1, 1);
    expect(placeBuilding(state, 'cooling_fan', 1, 1)).toEqual({ ok: false, reason: 'occupied' });
    expect(state.buildings).toHaveLength(1);
  });

  it('rejects out-of-bounds and non-integer tiles', () => {
    const state = testState(5, 5);
    for (const [x, y] of [[-1, 0], [0, -1], [5, 0], [0, 5], [1.5, 2]] as const) {
      expect(placeBuilding(state, 'rack_basic', x, y)).toEqual({ ok: false, reason: 'out_of_bounds' });
    }
    expect(state.buildings).toHaveLength(0);
  });

  it('rejects placing when cash is below the cost', () => {
    const state = testState(5, 5);
    state.cash = B.rack_basic.cost - 1;
    expect(placeBuilding(state, 'rack_basic', 0, 0)).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(state.cash).toBe(B.rack_basic.cost - 1);
  });

  it('rejects placing while in overdraft', () => {
    const state = testState(5, 5);
    state.cash = -10;
    expect(placeBuilding(state, 'rack_basic', 0, 0)).toEqual({ ok: false, reason: 'insufficient_funds' });
  });
});

describe('selling buildings', () => {
  it('removes the building and refunds part of its cost', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'power_basic', 4, 4);
    expect(sellBuilding(state, 4, 4)).toEqual({ ok: true });
    expect(getBuildingAt(state, 4, 4)).toBeUndefined();
    expect(state.cash).toBe(E.startingCash - B.power_basic.cost + B.power_basic.cost * E.sellRefund);
  });

  it('rejects selling an empty tile', () => {
    const state = testState(5, 5);
    expect(sellBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('repairing racks', () => {
  it('a failed rack can be repaired for a fee and goes offline for repairTicks', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    rack.status = 'failed';
    state.tick = 100;
    const before = state.cash;

    expect(repairRack(state, 0, 0)).toEqual({ ok: true });
    expect(state.cash).toBe(before - repairCost(rack));
    expect(rack.status).toBe('repairing');
    expect(rack.repairDoneTick).toBe(100 + E.repairTicks);
  });

  it('rejects repairing a working rack or a non-rack', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'cooling_fan', 1, 0);
    expect(repairRack(state, 0, 0)).toEqual({ ok: false, reason: 'not_failed' });
    expect(repairRack(state, 1, 0)).toEqual({ ok: false, reason: 'no_rack' });
  });

  it('rejects repairing without enough cash', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    rack.status = 'failed';
    state.cash = repairCost(rack) - 1;
    expect(repairRack(state, 0, 0)).toEqual({ ok: false, reason: 'insufficient_funds' });
  });
});

describe('bankruptcy', () => {
  it('blocks building, selling and repairing', () => {
    const state = testState(5, 5);
    placeBuilding(state, 'rack_basic', 0, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    state.bankrupt = true;
    expect(placeBuilding(state, 'rack_basic', 1, 1)).toEqual({ ok: false, reason: 'bankrupt' });
    expect(sellBuilding(state, 0, 0)).toEqual({ ok: false, reason: 'bankrupt' });
    expect(repairRack(state, 0, 0)).toEqual({ ok: false, reason: 'bankrupt' });
  });
});
