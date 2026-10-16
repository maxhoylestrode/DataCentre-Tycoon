// Checks every piece of progression content on every test run, so a bad data
// entry fails here instead of breaking the game at runtime.

import { describe, expect, it } from 'vitest';
import { BUILDING_KINDS, isBuildingKind } from '../src/config';
import { validateCondition } from '../src/sim/conditions';
import { ACHIEVEMENTS } from '../src/sim/content/achievements';
import { GOALS } from '../src/sim/content/goals';
import { TIERS } from '../src/sim/content/tiers';
import type { Reward } from '../src/sim/content/types';
import { UNLOCKS } from '../src/sim/content/unlocks';
import { MECHANICS } from '../src/sim/progression';

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

function rewardProblems(reward: Reward): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(reward.xp) || reward.xp < 0) problems.push(`xp ${reward.xp} must be a whole number >= 0`);
  if (reward.cash !== undefined && (!Number.isFinite(reward.cash) || reward.cash < 0)) {
    problems.push(`cash ${reward.cash} must be >= 0`);
  }
  return problems;
}

const ID_PATTERN = /^[a-z0-9_]+$/;

describe('content', () => {
  it('ids are unique and well formed', () => {
    for (const list of [TIERS, UNLOCKS, GOALS, ACHIEVEMENTS]) {
      const ids = list.map((x) => x.id);
      expect(duplicates(ids)).toEqual([]);
      for (const id of ids) expect(id, id).toMatch(ID_PATTERN);
    }
    // Goals and achievements share the save, so their ids must not collide either.
    expect(duplicates([...GOALS, ...ACHIEVEMENTS].map((x) => x.id))).toEqual([]);
  });

  describe('tiers', () => {
    it('start at level 1 with strictly increasing thresholds', () => {
      expect(TIERS[0]?.minLevel).toBe(1);
      for (let i = 1; i < TIERS.length; i++) {
        expect(TIERS[i]!.minLevel, TIERS[i]!.id).toBeGreaterThan(TIERS[i - 1]!.minLevel);
      }
    });

    it('have a name and the problem they introduce', () => {
      for (const tier of TIERS) {
        expect(tier.name, tier.id).not.toBe('');
        expect(tier.description, tier.id).not.toBe('');
      }
    });
  });

  describe('unlocks', () => {
    it('point at things that exist', () => {
      for (const unlock of UNLOCKS) {
        if (unlock.type === 'building') expect(isBuildingKind(unlock.id), unlock.id).toBe(true);
        else expect(MECHANICS as readonly string[], unlock.id).toContain(unlock.id);
      }
    });

    it('cover every building and mechanic, so nothing is unreachable', () => {
      const ids = UNLOCKS.map((u) => u.id);
      for (const kind of BUILDING_KINDS) expect(ids, kind).toContain(kind);
      for (const mechanic of MECHANICS) expect(ids, mechanic).toContain(mechanic);
    });

    it('have whole-number levels from 1, and at least one thing at level 1', () => {
      for (const unlock of UNLOCKS) {
        expect(Number.isInteger(unlock.level) && unlock.level >= 1, unlock.id).toBe(true);
      }
      expect(UNLOCKS.some((u) => u.type === 'building' && u.level === 1)).toBe(true);
    });

    it('mechanics have a name and description', () => {
      for (const unlock of UNLOCKS.filter((u) => u.type === 'mechanic')) {
        expect(unlock.name, unlock.id).toBeTruthy();
        expect(unlock.description, unlock.id).toBeTruthy();
      }
    });
  });

  describe('goals', () => {
    it('use implemented condition types with valid parameters', () => {
      for (const goal of GOALS) expect(validateCondition(goal.condition), goal.id).toEqual([]);
    });

    it('have valid rewards', () => {
      for (const goal of GOALS) expect(rewardProblems(goal.reward), goal.id).toEqual([]);
    });

    it('only come after goals that exist', () => {
      const ids = new Set(GOALS.map((g) => g.id));
      for (const goal of GOALS) {
        for (const before of goal.after ?? []) {
          expect(ids.has(before), `${goal.id} after ${before}`).toBe(true);
          expect(before, goal.id).not.toBe(goal.id);
        }
      }
    });

    it('can all be reached: no cycles, and at least one starting goal', () => {
      expect(GOALS.some((g) => (g.after ?? []).length === 0)).toBe(true);
      const done = new Set<string>();
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const goal of GOALS) {
          if (!done.has(goal.id) && (goal.after ?? []).every((id) => done.has(id))) {
            done.add(goal.id);
            progressed = true;
          }
        }
      }
      expect(GOALS.filter((g) => !done.has(g.id)).map((g) => g.id)).toEqual([]);
    });
  });

  describe('achievements', () => {
    it('use implemented condition types and have valid rewards and names', () => {
      for (const a of ACHIEVEMENTS) {
        expect(validateCondition(a.condition), a.id).toEqual([]);
        expect(rewardProblems(a.reward), a.id).toEqual([]);
        expect(a.name, a.id).toBeTruthy();
      }
    });
  });
});
