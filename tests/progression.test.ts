import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  hireStaff,
  paintZone,
  placeBuilding,
  placeFloor,
  placeWall,
  repairRack,
  upgradeUplink,
} from '../src/sim/commands';
import { lotSize } from '../src/sim/lots';
import { evaluate, isMet } from '../src/sim/conditions';
import { GOALS } from '../src/sim/content/goals';
import { TIERS } from '../src/sim/content/tiers';
import { UNLOCKS } from '../src/sim/content/unlocks';
import {
  activeGoals,
  awardBuildXp,
  checkProgress,
  endDay,
  isUnlocked,
  levelInfo,
  levelOf,
  tierFor,
  totalXpForLevel,
  unlocksBetween,
  xpToNext,
} from '../src/sim/progression';
import { createInitialState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';

const P = CONFIG.progression;

describe('level curve', () => {
  it('follows xpBase * level ^ xpExponent', () => {
    expect(xpToNext(1)).toBe(P.xpBase);
    expect(xpToNext(4)).toBe(Math.round(P.xpBase * 4 ** P.xpExponent));
  });

  it('gets steeper as levels rise', () => {
    for (let l = 1; l < 50; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it('turns total XP into level and progress through it', () => {
    expect(levelInfo(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: xpToNext(1) });
    expect(levelInfo(xpToNext(1) - 1).level).toBe(1);
    expect(levelInfo(xpToNext(1)).level).toBe(2);
    const info = levelInfo(totalXpForLevel(7) + 5);
    expect(info).toEqual({ level: 7, xpIntoLevel: 5, xpForNext: xpToNext(7) });
  });

  it('has no max level', () => {
    expect(levelInfo(totalXpForLevel(500)).level).toBe(500);
  });

  it('names the tier for any level, including past the last tier', () => {
    expect(tierFor(1)).toBe(TIERS[0]);
    for (const tier of TIERS) expect(tierFor(tier.minLevel)).toBe(tier);
    expect(tierFor(10_000)).toBe(TIERS[TIERS.length - 1]);
  });
});

describe('unlocks', () => {
  it('a new game can only build what unlocks at level 1', () => {
    const state = createInitialState(10, 10);
    for (const unlock of UNLOCKS) expect(isUnlocked(state, unlock.id)).toBe(unlock.level <= 1);
  });

  it('placing a locked building is rejected', () => {
    const state = createInitialState(10, 10);
    const locked = UNLOCKS.find((u) => u.type === 'building' && u.level > 1)!;
    expect(placeBuilding(state, locked.id as never, 0, 0)).toEqual({ ok: false, reason: 'locked' });
  });

  it('reaching the level unlocks it', () => {
    const state = createInitialState(10, 10);
    state.cash = 100_000;
    const locked = UNLOCKS.find((u) => u.type === 'building' && u.level > 1)!;
    state.progress.xp = totalXpForLevel(locked.level);
    expect(isUnlocked(state, locked.id)).toBe(true);
    expect(placeBuilding(state, locked.id as never, 0, 0).ok).toBe(true);
  });

  it('unknown ids are never unlocked', () => {
    const state = createInitialState(10, 10);
    state.progress.xp = totalXpForLevel(1000);
    expect(isUnlocked(state, 'rack_quantum')).toBe(false);
  });

  it('lists exactly the unlocks gained between two levels', () => {
    const gained = unlocksBetween(1, 3).map((u) => u.id);
    expect(gained).toEqual(UNLOCKS.filter((u) => u.level === 2 || u.level === 3).map((u) => u.id));
    expect(unlocksBetween(1000, 1001)).toEqual([]);
  });
});

describe('XP sources', () => {
  it('building gives a small amount of XP, capped per day', () => {
    const state = createInitialState(10, 10);
    const tries = P.buildXpDailyCap / P.buildXp + 5;
    for (let i = 0; i < tries; i++) awardBuildXp(state);
    expect(state.progress.xp).toBe(P.buildXpDailyCap);

    state.tick = CONFIG.time.ticksPerDay;
    awardBuildXp(state);
    expect(state.progress.xp).toBe(P.buildXpDailyCap + P.buildXp);
  });

  it('a new best day of profit gives XP; a worse day does not', () => {
    const state = createInitialState(10, 10);
    state.progress.stats.dayProfit = 500;
    endDay(state);
    expect(state.progress.xp).toBe(P.profitRecordXp);
    expect(state.progress.stats.bestDayProfit).toBe(500);
    expect(state.progress.stats.dayProfit).toBe(0);

    state.progress.stats.dayProfit = 400;
    endDay(state);
    expect(state.progress.xp).toBe(P.profitRecordXp);
  });

  it('a losing day is never a record', () => {
    const state = createInitialState(10, 10);
    state.progress.stats.dayProfit = -100;
    endDay(state);
    expect(state.progress.xp).toBe(0);
  });

  it('ticks track total income', () => {
    const state = createInitialState(10, 10);
    placeBuilding(state, 'rack_basic', 5, 5);
    for (let i = 0; i < CONFIG.economy.rackRampTicks; i++) tick(state);
    expect(state.progress.stats.totalEarned).toBeGreaterThan(0);
  });
});

describe('goals', () => {
  it('a new game shows only goals with no prerequisites', () => {
    const state = createInitialState(10, 10);
    for (const goal of activeGoals(state)) expect(goal.after ?? []).toEqual([]);
    expect(activeGoals(state).length).toBeGreaterThan(0);
  });

  it('never shows more than maxActiveGoals', () => {
    const state = createInitialState(10, 10);
    state.progress.completedGoals = GOALS.slice(0, 3).map((g) => g.id);
    expect(activeGoals(state).length).toBeLessThanOrEqual(P.maxActiveGoals);
  });

  it('completing a goal pays its reward and reveals the next ones', () => {
    const state = createInitialState(10, 10);
    const first = GOALS.find((g) => g.id === 'first_rack')!;
    const before = activeGoals(state).map((g) => g.id);
    placeBuilding(state, 'rack_basic', 0, 0);

    expect(state.progress.completedGoals).toContain('first_rack');
    expect(state.progress.xp).toBeGreaterThanOrEqual(first.reward.xp);
    const after = activeGoals(state).map((g) => g.id);
    expect(after).not.toContain('first_rack');
    expect(after.some((id) => !before.includes(id))).toBe(true);
  });

  it('each goal completes once only', () => {
    const state = createInitialState(10, 10);
    placeBuilding(state, 'rack_basic', 0, 0);
    const xp = state.progress.xp;
    checkProgress(state);
    checkProgress(state);
    expect(state.progress.xp).toBe(xp);
    expect(state.progress.completedGoals.filter((id) => id === 'first_rack')).toHaveLength(1);
  });

  it('goal cash rewards are paid', () => {
    const state = createInitialState(10, 10);
    state.progress.completedGoals = ['first_rack'];
    state.progress.stats.totalEarned = 1_000;
    const earn = GOALS.find((g) => g.id === 'earn_1k')!;
    const cash = state.cash;
    checkProgress(state);
    expect(state.progress.completedGoals).toContain('earn_1k');
    expect(state.cash).toBe(cash + (earn.reward.cash ?? 0));
  });

  it('reaching a level by goals unlocks new buildings', () => {
    const state = createInitialState(10, 10);
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    placeBuilding(state, 'rack_basic', 4, 0);
    expect(levelOf(state)).toBeGreaterThanOrEqual(2);
    expect(isUnlocked(state, 'power_basic')).toBe(true);
  });
});

describe('achievements', () => {
  it('a repair earns its achievement once', () => {
    const state = createInitialState(10, 10);
    placeBuilding(state, 'rack_basic', 0, 0);
    getBuildingAt(state, 0, 0)!.status = 'failed';
    repairRack(state, 0, 0);
    expect(state.progress.achievements).toContain('first_repair');
    checkProgress(state);
    expect(state.progress.achievements.filter((id) => id === 'first_repair')).toHaveLength(1);
  });
});

// One test per condition type (see sim/conditions.ts).
describe('conditions', () => {
  const state = createInitialState(10, 10);
  state.cash = 100_000;
  state.progress.xp = totalXpForLevel(10);
  placeBuilding(state, 'rack_basic', 0, 0);
  placeBuilding(state, 'rack_basic', 2, 0);
  placeBuilding(state, 'power_basic', 4, 0);
  state.tick = CONFIG.time.ticksPerDay * 2 + 5;
  Object.assign(state.progress.stats, { totalEarned: 1234, repairs: 2, failures: 3 });

  it('rackCount', () => expect(evaluate(state, { type: 'rackCount', min: 5 })).toEqual({ current: 2, target: 5 }));
  it('buildingCount', () => {
    expect(evaluate(state, { type: 'buildingCount', kind: 'power_basic', min: 1 }).current).toBe(1);
    expect(evaluate(state, { type: 'buildingCount', kind: 'cooling_fan', min: 1 }).current).toBe(0);
  });
  it('totalEarned', () => expect(isMet(state, { type: 'totalEarned', min: 1234 })).toBe(true));
  it('netIncome', () => expect(isMet(state, { type: 'netIncome', min: 1000 })).toBe(false));
  it('cash', () => expect(evaluate(state, { type: 'cash', min: 1 }).current).toBe(state.cash));
  it('day', () => expect(evaluate(state, { type: 'day', min: 3 }).current).toBe(3));
  it('repairs', () => expect(isMet(state, { type: 'repairs', min: 2 })).toBe(true));
  it('failures', () => expect(isMet(state, { type: 'failures', min: 4 })).toBe(false));
  it('level', () => expect(evaluate(state, { type: 'level', min: 10 }).current).toBe(10));

  it('upgrades', () => {
    const s = createInitialState(5, 5);
    s.progress.stats.upgrades = 7;
    expect(evaluate(s, { type: 'upgrades', min: 1 }).current).toBe(7);
  });
  it('highestUpgrade', () => {
    expect(evaluate(state, { type: 'highestUpgrade', min: 1 }).current).toBe(0);
    state.buildings[0]!.upgrade = 4;
    expect(evaluate(state, { type: 'highestUpgrade', min: 1 }).current).toBe(4);
    state.buildings[0]!.upgrade = 0;
  });

  it('prestige', () => {
    const s = createInitialState(10, 10);
    s.progress.xp = totalXpForLevel(10);
    s.cash = 100_000;
    placeBuilding(s, 'plant_small', 0, 0);
    expect(evaluate(s, { type: 'prestige', min: 1 }).current).toBe(CONFIG.buildings.plant_small.prestige);
  });
  it('fedVents', () => {
    const s = createInitialState(10, 10);
    s.progress.xp = totalXpForLevel(11);
    s.cash = 100_000;
    placeBuilding(s, 'chiller', 5, 5);
    placeFloor(s, 'floor_vent', 4, 4);
    expect(evaluate(s, { type: 'fedVents', min: 1 }).current).toBe(1);
  });
  it('liquidCooledRacks', () => {
    const s = createInitialState(10, 10);
    s.progress.xp = totalXpForLevel(12);
    s.cash = 100_000;
    placeBuilding(s, 'rack_basic', 0, 0);
    expect(evaluate(s, { type: 'liquidCooledRacks', min: 1 }).current).toBe(0);
    s.buildings[0]!.parts.cooling = 'cool_rear_door';
    expect(evaluate(s, { type: 'liquidCooledRacks', min: 1 }).current).toBe(1);
  });

  describe('contract conditions', () => {
    const s = createInitialState(10, 10);
    Object.assign(s.progress.stats, { contractsSigned: 4, contractsCompleted: 3, contractsFailed: 1, perfectContracts: 2 });
    s.contracts.active.push({
      id: 1, customerType: 'startup', name: 'A', racks: 1, days: 1, payPerRackPerTick: 1, sla: 0.9,
      bonus: 0, penalty: 0, xp: 0, startTick: 0, endTick: 1440, servedRackTicks: 0, promisedRackTicks: 0,
    });
    it('contractsSigned', () => expect(evaluate(s, { type: 'contractsSigned', min: 1 }).current).toBe(4));
    it('contractsCompleted', () => expect(evaluate(s, { type: 'contractsCompleted', min: 1 }).current).toBe(3));
    it('contractsFailed', () => expect(evaluate(s, { type: 'contractsFailed', min: 1 }).current).toBe(1));
    it('activeContracts', () => expect(evaluate(s, { type: 'activeContracts', min: 1 }).current).toBe(1));
    it('perfectContracts', () => expect(evaluate(s, { type: 'perfectContracts', min: 1 }).current).toBe(2));
  });

  describe('staff, network and building conditions', () => {
    const s = createInitialState(undefined, undefined, 1, { staffSim: true });
    s.cash = 1_000_000;
    s.progress.xp = totalXpForLevel(30);
    hireStaff(s, 'engineer');
    hireStaff(s, 'technician');
    hireStaff(s, 'technician');
    upgradeUplink(s);
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const) {
      placeBuilding(s, 'power_basic', x, y);
      getBuildingAt(s, x, y)!.status = 'ok'; // skip construction
    }
    for (const x of [1, 2, 3]) paintZone(s, 'staff', x, 8);
    Object.assign(s.progress.stats, { clientsServed: 6, services: 7, refurbishes: 2 });

    it('staffCount (the founder does not count)', () => expect(evaluate(s, { type: 'staffCount', min: 1 }).current).toBe(3));
    it('staffCount by role', () => {
      expect(evaluate(s, { type: 'staffCount', role: 'technician', min: 1 }).current).toBe(2);
    });
    it('uplinkMbps', () => expect(evaluate(s, { type: 'uplinkMbps', min: 1 }).current).toBe(1_000));
    it('multiblocks', () => expect(evaluate(s, { type: 'multiblocks', min: 1 }).current).toBe(1));
    it('zoneTiles', () => expect(evaluate(s, { type: 'zoneTiles', zone: 'staff', min: 1 }).current).toBe(3));
    it('clientsServed', () => expect(evaluate(s, { type: 'clientsServed', min: 1 }).current).toBe(6));
    it('services', () => expect(evaluate(s, { type: 'services', min: 1 }).current).toBe(7));
    it('refurbishes', () => expect(evaluate(s, { type: 'refurbishes', min: 1 }).current).toBe(2));
    it('receptionReady needs both a front door and a desk', () => {
      expect(evaluate(s, { type: 'receptionReady', min: 1 }).current).toBe(0);
      const { h } = lotSize(s);
      placeWall(s, 'door_outside', 8, h, 'h');
      placeBuilding(s, 'desk_reception', 8, h - 2);
      expect(evaluate(s, { type: 'receptionReady', min: 1 }).current).toBe(0); // desk still being built
      getBuildingAt(s, 8, h - 2)!.status = 'ok';
      expect(evaluate(s, { type: 'receptionReady', min: 1 }).current).toBe(1);
    });
  });
});
