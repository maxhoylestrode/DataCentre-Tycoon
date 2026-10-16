import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { placeBuilding, placeFloor, removeFloor, sellBuilding } from '../src/sim/commands';
import { costsPerTick } from '../src/sim/economy';
import { feedVents } from '../src/sim/floor';
import { stepHeat } from '../src/sim/heat';
import { totalXpForLevel } from '../src/sim/progression';
import { createInitialState, floorAt, type GameState, getBuildingAt, tempAt } from '../src/sim/state';

const CHILLER = CONFIG.buildings.chiller;

function floorState(): GameState {
  const state = createInitialState(20, 14);
  state.cash = 10_000_000;
  state.progress.xp = totalXpForLevel(11);
  for (let i = 0; i < 3; i++) placeBuilding(state, 'power_basic', i, 13);
  return state;
}

describe('floor vents', () => {
  it('can be placed under a building, but not twice on one tile', () => {
    const state = floorState();
    placeBuilding(state, 'rack_basic', 5, 5);
    expect(placeFloor(state, 'floor_vent', 5, 5)).toEqual({ ok: true });
    expect(placeFloor(state, 'floor_vent', 5, 5)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('are locked before level 11', () => {
    const state = createInitialState(10, 10);
    expect(placeFloor(state, 'floor_vent', 1, 1)).toEqual({ ok: false, reason: 'locked' });
  });

  it('do nothing without a chiller in range', () => {
    const state = floorState();
    placeFloor(state, 'floor_vent', 5, 5);
    expect(feedVents(state).fed.size).toBe(0);
    placeBuilding(state, 'chiller', 5 + CHILLER.chillerRange + 1, 5);
    expect(feedVents(state).fed.size).toBe(0);
    placeBuilding(state, 'chiller', 5 + CHILLER.chillerRange, 5);
    expect(feedVents(state).fed.size).toBe(1);
  });

  it('a chiller feeds at most its capacity', () => {
    const state = floorState();
    placeBuilding(state, 'chiller', 10, 6);
    let placed = 0;
    for (let y = 2; y <= 10 && placed < CHILLER.chillerCapacity + 3; y++) {
      for (let x = 6; x <= 14 && placed < CHILLER.chillerCapacity + 3; x++) {
        if (placeFloor(state, 'floor_vent', x, y).ok) placed++;
      }
    }
    const feed = feedVents(state);
    expect(feed.fed.size).toBe(CHILLER.chillerCapacity);
    expect(feed.load.get(getBuildingAt(state, 10, 6)!.id)).toBe(CHILLER.chillerCapacity);
  });

  it('a fed vent cools the rack above it', () => {
    const run = (withVent: boolean): number => {
      const state = floorState();
      for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) placeBuilding(state, 'rack_basic', x, y);
      if (withVent) {
        placeBuilding(state, 'chiller', 9, 6);
        for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) placeFloor(state, 'floor_vent', x, y);
      }
      for (let i = 0; i < 600; i++) stepHeat(state, 1);
      return tempAt(state, 6, 6);
    };
    const hot = run(false);
    const cooled = run(true);
    expect(hot).toBeGreaterThan(CONFIG.heat.failTemp);
    expect(cooled).toBeLessThan(CONFIG.heat.warnTemp);
  });

  it('a failed chiller stops feeding', () => {
    const state = floorState();
    placeBuilding(state, 'chiller', 6, 5);
    placeFloor(state, 'floor_vent', 5, 5);
    getBuildingAt(state, 6, 5)!.status = 'failed';
    expect(feedVents(state).fed.size).toBe(0);
  });

  it('cost upkeep and refund half when removed', () => {
    const state = floorState();
    const costs = costsPerTick(state);
    placeFloor(state, 'floor_vent', 3, 3);
    expect(costsPerTick(state)).toBeCloseTo(
      costs + CONFIG.floors.floor_vent.upkeepPerTick * CONFIG.economy.runningCostMultiplier,
    );
    const cash = state.cash;
    expect(removeFloor(state, 3, 3)).toEqual({ ok: true });
    expect(state.cash).toBe(cash + CONFIG.floors.floor_vent.cost * CONFIG.economy.sellRefund);
    expect(floorAt(state, 3, 3)).toBeUndefined();
  });

  it('selling a building leaves the vent under it in place', () => {
    const state = floorState();
    placeBuilding(state, 'rack_basic', 4, 4);
    placeFloor(state, 'floor_vent', 4, 4);
    sellBuilding(state, 4, 4);
    expect(floorAt(state, 4, 4)).toBeDefined();
  });
});
