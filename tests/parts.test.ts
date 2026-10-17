import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  buildingStats,
  installedPart,
  investedValue,
  nextPart,
  partCost,
  partsForSlot,
  partTierTotal,
} from '../src/sim/buildings';
import { placeBuilding, sellBuilding, upgradePart } from '../src/sim/commands';
import { incomeBreakdown } from '../src/sim/economy';
import { stepHeat } from '../src/sim/heat';
import { totalXpForLevel } from '../src/sim/progression';
import { createInitialState, type GameState, getBuildingAt, tempAt } from '../src/sim/state';

const B = CONFIG.buildings;

function stateAtLevel(level: number): GameState {
  const state = createInitialState(12, 10);
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(level);
  return state;
}

function upgradeSlot(state: GameState, x: number, y: number, slot: Parameters<typeof upgradePart>[3], n: number): void {
  for (let i = 0; i < n; i++) expect(upgradePart(state, x, y, slot)).toEqual({ ok: true });
}

describe('rack parts', () => {
  it('a new rack has stock parts and the same numbers as before parts existed', () => {
    const state = stateAtLevel(1);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    expect(installedPart(rack, 'cpu')?.id).toBe(partsForSlot('cpu')[0]!.id);
    const s = buildingStats(rack);
    expect(s.income).toBeCloseTo(B.rack_basic.incomePerTick);
    expect(s.powerDraw).toBeCloseTo(B.rack_basic.powerDraw);
    expect(s.heat).toBeCloseTo(B.rack_basic.heatPerTick);
  });

  it('each part adds its income, power and heat over stock', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    const before = buildingStats(rack);
    const part = nextPart(rack, 'cpu')!;
    upgradeSlot(state, 0, 0, 'cpu', 1);
    const after = buildingStats(rack);
    expect(after.income - before.income).toBeCloseTo(part.income * CONFIG.upgrades.partIncomeMultiplier);
    expect(after.powerDraw - before.powerDraw).toBeCloseTo(part.powerDraw * CONFIG.upgrades.partPowerMultiplier);
    expect(after.heat - before.heat).toBeCloseTo(part.heat);
  });

  it('parts follow their slot path in order and stop at the best', () => {
    const state = stateAtLevel(100);
    placeBuilding(state, 'rack_basic', 0, 0);
    const path = partsForSlot('network');
    upgradeSlot(state, 0, 0, 'network', path.length - 1);
    expect(installedPart(getBuildingAt(state, 0, 0)!, 'network')?.id).toBe(path.at(-1)!.id);
    expect(upgradePart(state, 0, 0, 'network')).toEqual({ ok: false, reason: 'best_installed' });
  });

  it('better parts unlock with level', () => {
    const state = stateAtLevel(2);
    placeBuilding(state, 'rack_basic', 0, 0);
    upgradeSlot(state, 0, 0, 'cpu', 1); // EPYC 7302 is level 2
    expect(upgradePart(state, 0, 0, 'cpu')).toEqual({ ok: false, reason: 'part_locked' });
  });

  it('are locked entirely until upgrades unlock', () => {
    const state = stateAtLevel(1);
    // Under £100k, so cash achievements don't level us past the lock.
    state.cash = 50_000;
    placeBuilding(state, 'rack_basic', 0, 0);
    expect(upgradePart(state, 0, 0, 'cpu')).toEqual({ ok: false, reason: 'locked' });
  });

  it('only GPU racks have a GPU slot', () => {
    const state = stateAtLevel(30);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_gpu', 2, 0);
    expect(upgradePart(state, 0, 0, 'gpu')).toEqual({ ok: false, reason: 'no_slot' });
    expect(upgradePart(state, 2, 0, 'gpu')).toEqual({ ok: true });
  });

  it('bigger racks pay more per part and get more out of it', () => {
    const state = stateAtLevel(20);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_enterprise', 2, 0);
    const small = getBuildingAt(state, 0, 0)!;
    const big = getBuildingAt(state, 2, 0)!;
    const part = nextPart(small, 'ram')!;
    expect(partCost(big, part)).toBe(partCost(small, part) * B.rack_enterprise.partMultiplier);
    const smallGain = -buildingStats(small).income;
    const bigGain = -buildingStats(big).income;
    upgradeSlot(state, 0, 0, 'ram', 1);
    upgradeSlot(state, 2, 0, 'ram', 1);
    expect(bigGain + buildingStats(big).income).toBeCloseTo(
      (smallGain + buildingStats(small).income) * B.rack_enterprise.partMultiplier,
    );
  });

  it('rack cooling parts cut the whole rack’s heat', () => {
    const state = stateAtLevel(30);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    const before = buildingStats(rack).heat;
    upgradeSlot(state, 0, 0, 'cooling', 2); // rear door, then direct liquid cooling
    const dlc = installedPart(rack, 'cooling')!;
    expect(buildingStats(rack).heat).toBeCloseTo(before * (1 - dlc.heatReduction!));
  });

  it('an air-cooled hyperscale pod overheats; immersion cooling saves it', () => {
    const run = (cooled: boolean): number => {
      const state = stateAtLevel(40);
      for (let i = 0; i < 4; i++) placeBuilding(state, 'power_basic', i, 9);
      placeBuilding(state, 'rack_hyperscale', 6, 4);
      if (cooled) upgradeSlot(state, 6, 4, 'cooling', 3);
      for (let i = 0; i < 1440; i++) stepHeat(state, 1);
      return tempAt(state, 6, 4);
    };
    expect(run(false)).toBeGreaterThan(CONFIG.heat.failTemp);
    expect(run(true)).toBeLessThan(CONFIG.heat.warnTemp);
  });

  it('charges the part cost, counts as an upgrade and adds to the sell value', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    const rack = getBuildingAt(state, 0, 0)!;
    const part = nextPart(rack, 'storage')!;
    const cash = state.cash;
    upgradeSlot(state, 0, 0, 'storage', 1);
    expect(state.cash).toBe(cash - partCost(rack, part));
    expect(state.progress.stats.upgrades).toBe(1);
    expect(investedValue(rack)).toBe(B.rack_basic.cost + partCost(rack, part));
    expect(partTierTotal(rack)).toBe(1);

    const before = state.cash;
    sellBuilding(state, 0, 0);
    expect(state.cash).toBeCloseTo(before + (B.rack_basic.cost + partCost(rack, part)) * CONFIG.economy.sellRefund);
  });

  it('a failed rack must be repaired before fitting parts', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'rack_basic', 0, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    expect(upgradePart(state, 0, 0, 'cpu')).toEqual({ ok: false, reason: 'not_working' });
  });

  it('contracts use the least valuable racks, leaving upgraded ones on walk-in', () => {
    const state = stateAtLevel(10);
    placeBuilding(state, 'power_basic', 9, 9);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    state.tick = CONFIG.economy.rackRampTicks;
    upgradeSlot(state, 2, 0, 'cpu', 2);
    state.contracts.active.push({
      id: 1, customerType: 'startup', name: 'A', racks: 1, days: 1, payPerRackPerTick: 4, sla: 0.9,
      bonus: 0, penalty: 0, xp: 0, startTick: state.tick, endTick: state.tick + 1440,
      servedRackTicks: 0, promisedRackTicks: 0,
    });
    const { allocation } = incomeBreakdown(state);
    expect(allocation.walkIn.map((b) => `${b.x},${b.y}`)).toEqual(['2,0']);
  });
});
