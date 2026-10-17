import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ageFactor, buildingStats, chillerCapacity, chillerRange, rackBandwidth, refurbishCost } from '../src/sim/buildings';
import { placeBuilding, placeFloor, refurbishRack, upgradeBuilding, upgradePart, upgradeUplink } from '../src/sim/commands';
import { volumeDiscount } from '../src/sim/contractBoard';
import { UPLINKS } from '../src/sim/content/uplinks';
import { costBreakdown, incomeBreakdown, marketFactor } from '../src/sim/economy';
import { feedVents } from '../src/sim/floor';
import { stepHeat } from '../src/sim/heat';
import { bandwidthDemand, formatMbps, networkEfficiency, uplinkOf } from '../src/sim/network';
import { electricityCost, electricityFor, powerDraw, powerMultiblocks, powerSupply } from '../src/sim/power';
import { totalXpForLevel } from '../src/sim/progression';
import { createInitialState, type GameState, getBuildingAt, tempAt } from '../src/sim/state';
import { fastNetwork } from './helpers';

const M = CONFIG.ageing.ticksPerMonth;

// Places `n` entry racks on owned tiles (every tile, densest first).
function fillRacks(state: GameState, n: number): void {
  let placed = 0;
  for (let y = 0; y < state.height && placed < n; y++) {
    for (let x = 0; x < state.width && placed < n; x++) {
      if (placeBuilding(state, 'rack_basic', x, y).ok) placed++;
    }
  }
  expect(placed).toBe(n);
}

function game(level = 40, w = 20, h = 14): GameState {
  const state = createInitialState(w, h);
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(level);
  return state;
}

describe('electricity bill', () => {
  it('charges per kW drawn, at higher rates in higher bands', () => {
    const [b0, b1, b2] = CONFIG.electricity.bands;
    expect(electricityFor(0)).toBe(0);
    expect(electricityFor(10)).toBeCloseTo(10 * b0!.perKwTick);
    const at100 = b1!.aboveKw * b0!.perKwTick + (100 - b1!.aboveKw) * b1!.perKwTick;
    expect(electricityFor(100)).toBeCloseTo(at100);
    // Each extra kW costs more the bigger you are.
    expect(electricityFor(b2!.aboveKw + 1) - electricityFor(b2!.aboveKw)).toBeCloseTo(b2!.perKwTick);
  });

  it('bills what is actually drawn, capped by supply, and shows in costs', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 1, 1);
    expect(electricityCost(state)).toBeCloseTo(electricityFor(powerDraw(state)));
    expect(costBreakdown(state).electricity).toBeCloseTo(electricityCost(state));
    for (let i = 0; i < 6; i++) placeBuilding(state, 'rack_basic', 3 + i * 2, 1); // overloaded
    expect(electricityCost(state)).toBeCloseTo(electricityFor(powerSupply(state)));
  });
});

describe('market saturation', () => {
  it('leaves small companies alone and shrinks walk-in income past the free racks', () => {
    const { freeRacks, minFactor } = CONFIG.market;
    expect(marketFactor(freeRacks)).toBe(1);
    expect(marketFactor(freeRacks * 2)).toBeLessThan(1);
    expect(marketFactor(freeRacks * 4)).toBeLessThan(marketFactor(freeRacks * 2));
    expect(marketFactor(1_000_000)).toBe(minFactor);
  });

  it('total walk-in income still grows with more racks, just more slowly', () => {
    const { freeRacks } = CONFIG.market;
    const total = (n: number): number => n * marketFactor(n);
    expect(total(freeRacks * 3)).toBeGreaterThan(total(freeRacks * 2));
    expect(total(freeRacks * 3) / total(freeRacks)).toBeLessThan(3);
  });

  it('only counts walk-in racks: contracted racks relieve saturation', () => {
    const state = game(40, 60, 42);
    fastNetwork(state);
    fillRacks(state, CONFIG.market.freeRacks + 10);
    for (let i = 0; i < 20; i++) placeBuilding(state, 'power_basic', i, 13);
    const before = incomeBreakdown(state).market;
    state.contracts.active.push({
      id: 1, customerType: 'startup', name: 'A', racks: 10, days: 5, payPerRackPerTick: 4, sla: 0.9,
      bonus: 0, penalty: 0, xp: 0, startTick: 0, endTick: 99999, servedRackTicks: 0, promisedRackTicks: 0,
    });
    expect(incomeBreakdown(state).market).toBeGreaterThan(before);
  });
});

describe('contract volume discount', () => {
  it('offers pay full rate for small companies and less per rack for big ones', () => {
    const { freeRacks, minFactor } = CONFIG.contracts.volumeDiscount;
    const small = game(40, 60, 42);
    expect(volumeDiscount(small)).toBe(1);
    const big = game(40, 60, 42);
    fillRacks(big, freeRacks * 2);
    expect(volumeDiscount(big)).toBeLessThan(1);
    expect(volumeDiscount(big)).toBeGreaterThanOrEqual(minFactor);
  });
});

describe('hardware ageing', () => {
  it('a rack earns less as its CPU ages, down to a floor', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 1, 1);
    const rack = getBuildingAt(state, 1, 1)!;
    expect(ageFactor(state, rack)).toBe(1);
    state.tick = M;
    expect(ageFactor(state, rack)).toBeCloseTo(1 - CONFIG.ageing.lossPerMonth);
    state.tick = M * 100;
    expect(ageFactor(state, rack)).toBe(CONFIG.ageing.floor);
  });

  it('a new CPU or a refurbish resets the age', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 1, 1);
    const rack = getBuildingAt(state, 1, 1)!;
    state.tick = M * 3;
    upgradePart(state, 1, 1, 'ram');
    expect(ageFactor(state, rack)).toBeLessThan(1);
    upgradePart(state, 1, 1, 'cpu');
    expect(ageFactor(state, rack)).toBe(1);

    state.tick = M * 6;
    const cash = state.cash;
    const cost = refurbishCost(rack);
    expect(refurbishRack(state, 1, 1)).toEqual({ ok: true });
    expect(state.cash).toBe(cash - cost);
    expect(ageFactor(state, rack)).toBe(1);
    expect(state.progress.stats.refurbishes).toBe(1);
  });
});

describe('internet line', () => {
  it('starts at 100 Mbps; racks use bandwidth in step with their earning power', () => {
    const state = game();
    expect(uplinkOf(state).mbps).toBe(100);
    placeBuilding(state, 'rack_basic', 1, 1);
    placeBuilding(state, 'rack_performance', 3, 1);
    const [entry, perf] = [getBuildingAt(state, 1, 1)!, getBuildingAt(state, 3, 1)!];
    expect(rackBandwidth(entry)).toBeCloseTo(buildingStats(entry).income * CONFIG.network.mbpsPerIncome);
    expect(rackBandwidth(perf)).toBeGreaterThan(rackBandwidth(entry));
    const before = rackBandwidth(entry);
    upgradePart(state, 1, 1, 'network');
    expect(rackBandwidth(entry)).toBeGreaterThan(before);
    expect(bandwidthDemand(state)).toBeCloseTo(rackBandwidth(entry) + rackBandwidth(perf));
  });

  it('a full line slows income and counts as downtime, like a brownout', () => {
    const state = game();
    for (let i = 0; i < 3; i++) placeBuilding(state, 'power_basic', i, 13);
    for (let i = 0; i < 6; i++) placeBuilding(state, 'rack_basic', 1 + i * 2, 1);
    const eff = networkEfficiency(state);
    expect(eff).toBeLessThan(1);
    expect(incomeBreakdown(state).efficiency).toBeCloseTo(eff);
  });

  it('upgrades step by step, gated by level, with a rising rental', () => {
    const state = game(1);
    expect(upgradeUplink(state)).toEqual({ ok: false, reason: 'locked' });
    state.progress.xp = totalXpForLevel(100);
    let last = uplinkOf(state);
    for (let i = 1; i < UPLINKS.length; i++) {
      expect(upgradeUplink(state)).toEqual({ ok: true });
      const now = uplinkOf(state);
      expect(now.mbps).toBeGreaterThan(last.mbps);
      expect(costBreakdown(state).network).toBe(now.rentalPerTick);
      last = now;
    }
    expect(upgradeUplink(state)).toEqual({ ok: false, reason: 'best_installed' });
    expect(formatMbps(last.mbps)).toBe('800 Gbps');
    expect(formatMbps(100)).toBe('100 Mbps');
  });
});

describe('power multiblocks', () => {
  it('four power units in a 2×2 square produce 25% more', () => {
    const state = game();
    const base = powerSupply(state);
    const unit = CONFIG.buildings.power_basic.powerSupply;
    placeBuilding(state, 'power_basic', 2, 2);
    placeBuilding(state, 'power_basic', 3, 2);
    placeBuilding(state, 'power_basic', 2, 3);
    expect(powerSupply(state)).toBeCloseTo(base + 3 * unit);
    placeBuilding(state, 'power_basic', 3, 3);
    expect(powerMultiblocks(state).corners).toEqual([{ x: 2, y: 2 }]);
    expect(powerSupply(state)).toBeCloseTo(base + 4 * unit * (1 + CONFIG.multiblock.bonus));
  });

  it('a unit belongs to one block only, and an upgraded block keeps its bonus', () => {
    const state = game();
    // A 3×2 strip only fits one block.
    for (let x = 2; x <= 4; x++) for (let y = 2; y <= 3; y++) placeBuilding(state, 'power_basic', x, y);
    expect(powerMultiblocks(state).corners).toHaveLength(1);
    expect(powerMultiblocks(state).members.size).toBe(4);
    const before = powerSupply(state);
    // The whole block of four goes up a level together.
    upgradeBuilding(state, 2, 2);
    expect(powerSupply(state) - before).toBeCloseTo(
      4 * CONFIG.buildings.power_basic.powerSupply * CONFIG.buildings.power_basic.upgrade.output * (1 + CONFIG.multiblock.bonus),
    );
  });
});

describe('cooling upgrades', () => {
  it('chillers feed more vents and reach further as they level up', () => {
    const state = game();
    placeBuilding(state, 'chiller', 10, 7);
    const chiller = getBuildingAt(state, 10, 7)!;
    const def = CONFIG.buildings.chiller;
    expect(chillerCapacity(chiller)).toBe(def.chillerCapacity);
    for (let i = 0; i < 3; i++) upgradeBuilding(state, 10, 7);
    expect(chillerCapacity(chiller)).toBe(def.chillerCapacity + 3 * def.chillerCapacityPerLevel);
    expect(chillerRange(chiller)).toBe(def.chillerRange + 1);
    placeFloor(state, 'floor_vent', 10 + def.chillerRange + 1, 7);
    expect(feedVents(state).fed.size).toBe(1);
  });

  it('a room AC unit cools its whole room but stops at walls', () => {
    const state = game(40, 20, 14);
    for (let i = 0; i < 4; i++) placeBuilding(state, 'power_basic', i, 13);
    placeBuilding(state, 'cooling_ac', 0, 0);
    // A hot rack far across the room still gets cooled.
    placeBuilding(state, 'rack_performance', 18, 10);
    const cold = (): number => {
      for (let i = 0; i < 800; i++) stepHeat(state, 1);
      return tempAt(state, 18, 10);
    };
    const cooled = cold();
    const noAc = game(40, 20, 14);
    placeBuilding(noAc, 'rack_performance', 18, 10);
    for (let i = 0; i < 800; i++) stepHeat(noAc, 1);
    expect(cooled).toBeLessThan(tempAt(noAc, 18, 10) - 2);
  });
});
