import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { nextPart, partCost, partsForSlot, upgradeCost } from '../src/sim/buildings';
import { placeBuilding, planUpgradeMax, upgradeMax } from '../src/sim/commands';
import { totalXpForLevel } from '../src/sim/progression';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';

function game(level: number, cash: number): GameState {
  const state = createInitialState(12, 10);
  state.progress.xp = totalXpForLevel(level);
  // Enough to build, but under £100k so cash achievements don't add levels.
  state.cash = 50_000;
  placeBuilding(state, 'power_basic', 0, 0);
  placeBuilding(state, 'rack_basic', 2, 0);
  state.cash = cash;
  return state;
}

describe('upgrade max', () => {
  it('levels a power unit up to your level when cash allows', () => {
    const state = game(6, 10_000_000);
    expect(upgradeMax(state, 0, 0)).toBe(6);
    expect(getBuildingAt(state, 0, 0)!.upgrade).toBe(6);
  });

  it('never passes the hard max', () => {
    const state = game(40, 100_000_000);
    upgradeMax(state, 0, 0);
    expect(getBuildingAt(state, 0, 0)!.upgrade).toBe(CONFIG.upgrades.maxLevel);
  });

  it('stops when the money runs out', () => {
    const unit = getBuildingAt(game(10, 0), 0, 0)!;
    const twoLevels = upgradeCost(unit, 0) + upgradeCost(unit, 1);
    const state = game(10, twoLevels + 1);
    expect(upgradeMax(state, 0, 0)).toBe(2);
    expect(state.cash).toBe(1);
  });

  it('the plan matches exactly what gets bought, and costs what it says', () => {
    const state = game(12, 30_000);
    const plan = planUpgradeMax(state, 2, 0);
    const cash = state.cash;
    expect(upgradeMax(state, 2, 0)).toBe(plan.steps.length);
    expect(cash - state.cash).toBe(plan.cost);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('racks buy the cheapest next part first, spreading upgrades across slots', () => {
    const state = game(30, 100_000_000);
    const rack = getBuildingAt(state, 2, 0)!;
    const firstStep = planUpgradeMax(state, 2, 0).steps[0]!;
    const cheapest = (['cpu', 'ram', 'storage', 'network', 'cooling'] as const)
      .map((slot) => ({ slot, cost: partCost(rack, nextPart(rack, slot)!) }))
      .sort((a, b) => a.cost - b.cost)[0]!;
    expect(firstStep).toMatchObject({ kind: 'part', slot: cheapest.slot });
  });

  it('with plenty of cash, every slot ends on the best part your level allows', () => {
    const state = game(15, 100_000_000);
    upgradeMax(state, 2, 0);
    const rack = getBuildingAt(state, 2, 0)!;
    for (const slot of ['cpu', 'ram', 'storage', 'network', 'cooling'] as const) {
      const allowed = partsForSlot(slot).filter((p) => p.level <= 15).at(-1)!;
      expect(rack.parts[slot] ?? partsForSlot(slot)[0]!.id, slot).toBe(allowed.id);
    }
  });

  it('does nothing before upgrades unlock, on failed racks, or for decorations', () => {
    expect(planUpgradeMax(game(1, 1_000_000), 2, 0).steps).toEqual([]);
    const failed = game(10, 1_000_000);
    getBuildingAt(failed, 2, 0)!.status = 'failed';
    expect(upgradeMax(failed, 2, 0)).toBe(0);
    const decor = game(10, 1_000_000);
    placeBuilding(decor, 'plant_small', 4, 0);
    expect(planUpgradeMax(decor, 4, 0).steps).toEqual([]);
  });
});
