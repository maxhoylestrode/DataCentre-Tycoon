// Checks every piece of progression content on every test run, so a bad data
// entry fails here instead of breaking the game at runtime.

import { describe, expect, it } from 'vitest';
import {
  BUILDING_KINDS,
  buildingDef,
  FLOOR_KINDS,
  isBuildingKind,
  isFloorKind,
  isWallKind,
  type PartSlot,
  WALL_KINDS,
} from '../src/config';
import { LOTS, STARTING_LOT } from '../src/sim/content/lots';
import { PARTS } from '../src/sim/content/parts';
import { ROOM_STYLES } from '../src/sim/content/styles';
import { validateCondition } from '../src/sim/conditions';
import { ACHIEVEMENTS } from '../src/sim/content/achievements';
import { CUSTOMER_NAME_PREFIXES, CUSTOMER_TYPES } from '../src/sim/content/customers';
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
        else if (unlock.type === 'floor') expect(isFloorKind(unlock.id), unlock.id).toBe(true);
        else if (unlock.type === 'wall') expect(isWallKind(unlock.id), unlock.id).toBe(true);
        else expect(MECHANICS as readonly string[], unlock.id).toContain(unlock.id);
      }
    });

    it('cover every building, floor and mechanic, so nothing is unreachable', () => {
      const ids = UNLOCKS.map((u) => u.id);
      for (const kind of BUILDING_KINDS) expect(ids, kind).toContain(kind);
      for (const kind of FLOOR_KINDS) expect(ids, kind).toContain(kind);
      for (const kind of WALL_KINDS) expect(ids, kind).toContain(kind);
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

  describe('parts', () => {
    const slots: PartSlot[] = ['cpu', 'ram', 'storage', 'network', 'gpu', 'cooling'];

    it('have unique well-formed ids, a brand, model and specs', () => {
      expect(duplicates(PARTS.map((p) => p.id))).toEqual([]);
      for (const p of PARTS) {
        expect(p.id, p.id).toMatch(ID_PATTERN);
        expect(p.brand && p.model && p.specs, p.id).toBeTruthy();
        expect(Number.isFinite(p.income) && Number.isFinite(p.powerDraw) && Number.isFinite(p.heat), p.id).toBe(true);
        expect(p.cost >= 0 && Number.isInteger(p.level) && p.level >= 1, p.id).toBe(true);
        if (p.heatReduction !== undefined) expect(p.heatReduction >= 0 && p.heatReduction < 1, p.id).toBe(true);
      }
    });

    it('each slot starts with a free stock part that adds nothing', () => {
      for (const slot of slots) {
        const stock = PARTS.find((p) => p.slot === slot);
        expect(stock, slot).toBeDefined();
        expect(stock!.cost, slot).toBe(0);
        expect([stock!.income, stock!.powerDraw, stock!.heat, stock!.heatReduction ?? 0], slot).toEqual([0, 0, 0, 0]);
      }
    });

    it('each slot path gets better, and never unlocks a step earlier than the one before', () => {
      for (const slot of slots) {
        const path = PARTS.filter((p) => p.slot === slot);
        for (let i = 1; i < path.length; i++) {
          const [prev, cur] = [path[i - 1]!, path[i]!];
          expect(cur.level >= prev.level, cur.id).toBe(true);
          expect(cur.cost > prev.cost, cur.id).toBe(true);
          const better = cur.income > prev.income || (cur.heatReduction ?? 0) > (prev.heatReduction ?? 0);
          expect(better, cur.id).toBe(true);
        }
      }
    });

    it('every rack’s slots have parts, and stock parts are available when the rack unlocks', () => {
      for (const kind of BUILDING_KINDS) {
        const def = buildingDef(kind);
        const rackLevel = UNLOCKS.find((u) => u.id === kind)!.level;
        for (const slot of def.slots ?? []) {
          const stock = PARTS.find((p) => p.slot === slot);
          expect(stock, `${kind}.${slot}`).toBeDefined();
          expect(stock!.level <= rackLevel, `${kind}.${slot}`).toBe(true);
        }
      }
    });
  });

  describe('room styles', () => {
    it('have unique ids, and each slot has a free level-1 default first', () => {
      expect(duplicates(ROOM_STYLES.map((s) => s.id))).toEqual([]);
      for (const slot of ['floor', 'wall', 'lighting'] as const) {
        const first = ROOM_STYLES.find((s) => s.slot === slot)!;
        expect(first, slot).toBeDefined();
        expect([first.cost, first.level, first.prestige], slot).toEqual([0, 1, 0]);
      }
      for (const s of ROOM_STYLES) {
        expect(s.id, s.id).toMatch(ID_PATTERN);
        expect(s.cost >= 0 && s.prestige >= 0 && s.level >= 1, s.id).toBe(true);
      }
    });
  });

  describe('lots', () => {
    it('have unique ids and positions, include the starting room, and connect to it', () => {
      expect(duplicates(LOTS.map((l) => l.id))).toEqual([]);
      expect(duplicates(LOTS.map((l) => `${l.col},${l.row}`))).toEqual([]);
      const start = LOTS.find((l) => l.id === STARTING_LOT);
      expect(start).toBeDefined();
      // Every lot is reachable by buying neighbours, starting from the first room.
      const reached = new Set([STARTING_LOT]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const l of LOTS) {
          if (reached.has(l.id)) continue;
          const touches = LOTS.some((o) => reached.has(o.id) && Math.abs(o.col - l.col) + Math.abs(o.row - l.row) === 1);
          if (touches) {
            reached.add(l.id);
            grew = true;
          }
        }
      }
      expect(LOTS.filter((l) => !reached.has(l.id)).map((l) => l.id)).toEqual([]);
      for (const l of LOTS) expect(l.col >= 0 && l.row >= 0, l.id).toBe(true);
    });
  });

  describe('customer types', () => {
    const ranges = ['racks', 'days', 'payMultiplier', 'sla'] as const;

    it('have unique well-formed ids and names to build company names from', () => {
      expect(duplicates(CUSTOMER_TYPES.map((t) => t.id))).toEqual([]);
      for (const t of CUSTOMER_TYPES) {
        expect(t.id, t.id).toMatch(ID_PATTERN);
        expect(t.nameSuffixes.length, t.id).toBeGreaterThan(0);
      }
      expect(CUSTOMER_NAME_PREFIXES.length).toBeGreaterThan(0);
    });

    it('have valid ranges (min <= max) with sensible values', () => {
      for (const t of CUSTOMER_TYPES) {
        for (const key of ranges) {
          const [min, max] = t[key];
          expect(min <= max, `${t.id}.${key}`).toBe(true);
          expect(min > 0, `${t.id}.${key}`).toBe(true);
        }
        expect(Number.isInteger(t.racks[0]) && Number.isInteger(t.racks[1]), t.id).toBe(true);
        expect(Number.isInteger(t.days[0]) && Number.isInteger(t.days[1]), t.id).toBe(true);
        expect(t.sla[1] <= 1, t.id).toBe(true);
        expect(t.bonusFraction >= 0 && t.penaltyFraction >= 0 && t.xp >= 0, t.id).toBe(true);
      }
    });

    it('requirements can actually be met by some rack, and every type has a colour', () => {
      const rackDefs = BUILDING_KINDS.map(buildingDef).filter((d) => d.category === 'rack');
      const maxTier = Math.max(...rackDefs.map((d) => d.tier ?? 0));
      const maxCores = Math.max(...PARTS.map((p) => p.cores ?? 0)) * Math.max(...rackDefs.map((d) => d.partMultiplier ?? 1));
      for (const t of CUSTOMER_TYPES) {
        expect(Number.isInteger(t.color) && t.color >= 0, t.id).toBe(true);
        const req = t.requirement;
        if (!req) continue;
        if (req.minRackTier !== undefined) expect(req.minRackTier >= 1 && req.minRackTier <= maxTier, t.id).toBe(true);
        if (req.minCores !== undefined) expect(req.minCores > 0 && req.minCores <= maxCores, t.id).toBe(true);
        if (req.gpu) expect(rackDefs.some((d) => d.slots?.includes('gpu')), t.id).toBe(true);
      }
    });

    it('every rack model has a tier, and CPUs list their cores', () => {
      for (const kind of BUILDING_KINDS) {
        const def = buildingDef(kind);
        if (def.category === 'rack') expect(Number.isInteger(def.tier) && def.tier! >= 1, kind).toBe(true);
      }
      for (const p of PARTS.filter((p) => p.slot === 'cpu')) expect((p.cores ?? 0) > 0, p.id).toBe(true);
    });

    it('at least one is available as soon as the contract board unlocks', () => {
      const boardLevel = UNLOCKS.find((u) => u.id === 'contract_board')!.level;
      expect(CUSTOMER_TYPES.some((t) => t.minLevel <= boardLevel)).toBe(true);
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
