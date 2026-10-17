import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { moveGroup, placeBuilding, sellBuilding, startResearch, upgradeBuilding } from '../src/sim/commands';
import { RESEARCH } from '../src/sim/content/research';
import { costBreakdown, incomeBreakdown } from '../src/sim/economy';
import { activeEffect, ambientTemp, attackMbps, ddosBlocked, ddosFactor, eventChancePerDay, stepEvents, triggerEvent } from '../src/sim/events';
import { firewallFilterMbps, firewallShare, upsBackupKw } from '../src/sim/safety';
import { canSellCompany, legacyPointsFor, sellCompany } from '../src/sim/legacy';
import { lineCapacity } from '../src/sim/network';
import { backupPower, electricityCost, powerMultiblocks, powerSupply, supplyBySource } from '../src/sim/power';
import { totalXpForLevel } from '../src/sim/progression';
import { researchBonus, researchTicks } from '../src/sim/research';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, type GameState, getBuildingAt, HISTORY_FIELDS } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { applyUndo, makeEntry, takeSnapshot } from '../src/sim/undo';
import { fastNetwork } from './helpers';

function game(level = 40): GameState {
  const state = createInitialState(20, 14);
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(level);
  fastNetwork(state);
  return state;
}

const run = (state: GameState, n: number): void => {
  for (let i = 0; i < n; i++) tick(state);
};

describe('power sources', () => {
  it('bigger sources produce more power', () => {
    const kinds = ['power_basic', 'power_gas', 'power_fuelcell', 'power_substation', 'power_reactor'] as const;
    const supplies = kinds.map((k) => CONFIG.buildings[k].powerSupply);
    for (let i = 1; i < supplies.length; i++) expect(supplies[i]!).toBeGreaterThan(supplies[i - 1]!);
  });

  it('a 2×2 multiblock needs four of the same kind', () => {
    const state = game();
    for (const [x, y] of [[0, 0], [1, 0], [0, 1]] as const) placeBuilding(state, 'power_gas', x, y);
    placeBuilding(state, 'power_basic', 1, 1);
    expect(powerMultiblocks(state).corners).toHaveLength(0);
    sellBuilding(state, 1, 1);
    placeBuilding(state, 'power_gas', 1, 1);
    expect(powerMultiblocks(state).corners).toHaveLength(1);
  });

  it('solar power is free: it comes off the electricity bill', () => {
    const withGas = game();
    const withSolar = game();
    for (const s of [withGas, withSolar]) for (let i = 0; i < 4; i++) placeBuilding(s, 'rack_basic', i * 2, 5);
    placeBuilding(withGas, 'power_gas', 0, 0);
    placeBuilding(withSolar, 'power_solar', 0, 0);
    expect(supplyBySource(withSolar).renewable).toBeGreaterThan(0);
    expect(electricityCost(withSolar)).toBeLessThan(electricityCost(withGas));
  });
});

describe('random events', () => {
  it('a power cut hits grid-fed supply; on-site generators and UPS batteries keep you going', () => {
    const state = game();
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'power_gas', 2, 0);
    const before = powerSupply(state);
    triggerEvent(state, 'power_cut');
    const cut = powerSupply(state);
    const grid = supplyBySource(state).grid;
    expect(cut).toBeCloseTo(before - grid * CONFIG.events.powerCutLoss);
    placeBuilding(state, 'ups_battery', 4, 0);
    expect(backupPower(state)).toBe(CONFIG.buildings.ups_battery.backupKw);
    expect(powerSupply(state)).toBeGreaterThan(cut);
  });

  it('timed events end on their own', () => {
    const state = game();
    triggerEvent(state, 'heatwave');
    expect(ambientTemp(state)).toBe(CONFIG.heat.ambient + CONFIG.events.heatwaveBoost);
    run(state, CONFIG.events.heatwaveTicks[1] + 1);
    expect(activeEffect(state, 'heatwave')).toBeUndefined();
    expect(ambientTemp(state)).toBe(CONFIG.heat.ambient);
  });

  it('a fire burns out racks unless fire suppression covers them', () => {
    const bare = game();
    const safe = game();
    for (const s of [bare, safe]) for (let i = 0; i < 3; i++) placeBuilding(s, 'rack_basic', 5 + i, 5);
    placeBuilding(safe, 'fire_suppression', 6, 7);
    triggerEvent(bare, 'fire');
    triggerEvent(safe, 'fire');
    expect(bare.buildings.filter((b) => b.status === 'failed').length).toBeGreaterThan(0);
    expect(safe.buildings.filter((b) => b.status === 'failed')).toHaveLength(0);
  });

  it('a cyber attack cuts the internet line; firewalls block part of it', () => {
    const state = game();
    const full = lineCapacity(state);
    triggerEvent(state, 'ddos');
    expect(ddosFactor(state)).toBeCloseTo(1 - CONFIG.events.ddosLoss);
    placeBuilding(state, 'firewall', 0, 0);
    const blocked = ddosBlocked(state);
    expect(blocked).toBeGreaterThan(0);
    expect(lineCapacity(state)).toBeCloseTo(full * (1 - CONFIG.events.ddosLoss * (1 - blocked)));
  });

  it('one firewall blocks at most half an attack; more firewalls and upgrades block more', () => {
    const state = game();
    state.uplink = 'uplink_800g';
    placeBuilding(state, 'firewall', 0, 0);
    const one = ddosBlocked(state);
    expect(one).toBeLessThan(CONFIG.safety.firewallMaxShare);
    placeBuilding(state, 'firewall', 2, 0);
    expect(ddosBlocked(state)).toBeCloseTo(one * 2);
    const fw = getBuildingAt(state, 0, 0)!;
    expect(upgradeBuilding(state, 0, 0).ok).toBe(true);
    expect(firewallFilterMbps(fw)).toBeCloseTo(CONFIG.buildings.firewall.ddosFilterMbps * CONFIG.safety.firewallGrowth);
    expect(ddosBlocked(state)).toBeGreaterThan(one * 2);
    fw.upgrade = CONFIG.upgrades.maxLevel;
    expect(firewallShare(fw, attackMbps(state))).toBeLessThanOrEqual(CONFIG.safety.firewallMaxShare);
    // On a small line, one firewall already hits its cap; two stop the attack.
    state.uplink = 'uplink_100m';
    expect(ddosBlocked(state)).toBe(1);
    triggerEvent(state, 'ddos');
    expect(ddosFactor(state)).toBe(1);
  });

  it('upgrading a UPS bank gives more backup', () => {
    const state = game();
    placeBuilding(state, 'ups_battery', 0, 0);
    const before = backupPower(state);
    expect(upgradeBuilding(state, 0, 0).ok).toBe(true);
    expect(backupPower(state)).toBeCloseTo(before * CONFIG.safety.upsGrowth);
    expect(upsBackupKw(getBuildingAt(state, 0, 0)!, CONFIG.upgrades.maxLevel)).toBeGreaterThan(before * 10);
  });

  it('good events pay out', () => {
    const state = game();
    const cash = state.cash;
    triggerEvent(state, 'rush_order', 10);
    expect(state.cash).toBeGreaterThan(cash);
  });

  it('nothing happens before incidents unlock; afterwards they happen, more with more racks', () => {
    const early = game(1);
    for (let t = 0; t < 2000; t++) {
      early.tick = t;
      stepEvents(early, 0);
    }
    expect(early.events.history).toHaveLength(0);
    const later = game();
    const small = eventChancePerDay(later);
    for (let i = 0; i < 10; i++) placeBuilding(later, 'rack_basic', i * 2, 3);
    expect(eventChancePerDay(later)).toBeGreaterThan(small);
    for (let t = 1; t < 20 * CONFIG.time.ticksPerDay; t++) {
      later.tick = t;
      stepEvents(later, 0);
    }
    expect(later.events.history.length).toBeGreaterThan(0);
  });
});

describe('research', () => {
  it('is paid upfront, takes its days, then gives its bonus', () => {
    const state = game();
    const project = RESEARCH.find((r) => r.id === 'r_efficient_psu')!;
    placeBuilding(state, 'power_basic', 0, 0);
    const before = powerSupply(state);
    const cash = state.cash;
    expect(startResearch(state, project.id).ok).toBe(true);
    expect(state.cash).toBe(cash - project.cost);
    expect(startResearch(state, 'r_hot_aisle')).toEqual({ ok: false, reason: 'busy' });
    state.cash = 1e12; // ignore running costs
    run(state, researchTicks(project) - 1);
    expect(state.research.done).not.toContain(project.id);
    run(state, 1);
    expect(state.research.done).toContain(project.id);
    expect(researchBonus(state, 'powerOutput')).toBeCloseTo(0.05);
    expect(powerSupply(state)).toBeCloseTo(before * 1.05);
  });

  it('needs its prerequisites and level', () => {
    const state = game();
    expect(startResearch(state, 'r_power_factor')).toEqual({ ok: false, reason: 'locked_requires' });
    const low = game(9);
    expect(startResearch(low, 'r_quantum_network').ok).toBe(false);
  });

  it('every project has valid prerequisites and positive effects', () => {
    const ids = new Set(RESEARCH.map((r) => r.id));
    expect(ids.size).toBe(RESEARCH.length);
    for (const r of RESEARCH) {
      for (const req of r.requires) expect(ids.has(req), `${r.id} needs ${req}`).toBe(true);
      expect(r.effects.length).toBeGreaterThan(0);
      for (const e of r.effects) expect(e.value).toBeGreaterThan(0);
    }
  });
});

describe('selling the company', () => {
  it('needs the level, and carries legacy points into the next game', () => {
    const state = game(10);
    expect(canSellCompany(state)).toBe(false);
    state.progress.xp = totalXpForLevel(CONFIG.legacy.minLevel);
    state.cash = 4_000_000;
    const points = legacyPointsFor(state);
    expect(points).toBeGreaterThan(0);
    const next = sellCompany(state, 5)!;
    expect(next.legacy).toEqual({ points, sales: 1 });
    expect(next.cash).toBe(CONFIG.economy.startingCash + points * CONFIG.legacy.startingCashPerPoint);
    expect(next.buildings).toHaveLength(0);
  });

  it('legacy points raise income', () => {
    const plain = game();
    const legacy = game();
    legacy.legacy.points = 10;
    for (const s of [plain, legacy]) {
      placeBuilding(s, 'rack_basic', 2, 2);
      getBuildingAt(s, 2, 2)!.builtAtTick = -CONFIG.economy.rackRampTicks;
    }
    expect(incomeBreakdown(legacy).walkIn).toBeCloseTo(incomeBreakdown(plain).walkIn * (1 + 10 * CONFIG.legacy.incomePerPoint));
  });
});

describe('stats history', () => {
  it('records one sample per game hour, capped', () => {
    const state = game();
    run(state, CONFIG.history.sampleTicks * 3);
    expect(state.history.samples).toHaveLength(3);
    expect(state.history.samples[0]!.tick).toBeGreaterThan(0);
  });

  it('tracks every stat, and the parts add up to the totals', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 3, 3);
    placeBuilding(state, 'power_basic', 0, 0);
    run(state, CONFIG.history.sampleTicks);
    const s = state.history.samples[0]!;
    for (const f of HISTORY_FIELDS) expect(s[f], f).toBeTypeOf('number');
    expect(s.walkIn! + s.contracts!).toBeCloseTo(s.income!);
    expect(s.rent! + s.upkeep! + s.electricity! + s.network! + s.wages!).toBeCloseTo(s.costs!);
    expect(s.racks).toBe(1);
    expect(s.maxTemp!).toBeGreaterThanOrEqual(s.avgTemp!);
  });

  it('reads samples from saves that tracked fewer stats, leaving the new ones empty', () => {
    const state = game();
    run(state, CONFIG.history.sampleTicks);
    const data = JSON.parse(serialize(state));
    const history = data.data.history;
    history.samples = [{ tick: 60, income: 5, costs: 2, cash: 100, powerDraw: 1, powerSupply: 12, uptime: 1, racks: 2 }];
    history.acc = { ticks: 10, income: 50, costs: 20, powerDraw: 0, powerSupply: 0, uptime: 10 };
    const loaded = deserialize(JSON.stringify(data));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const [sample] = loaded.state.history.samples;
    expect(sample).toMatchObject({ tick: 60, income: 5, racks: 2 });
    expect(sample!.walkIn).toBeUndefined();
    expect(loaded.state.history.acc).toEqual({ ticks: 0, sums: {} });
  });
});

describe('undo', () => {
  it('undoing a placement removes it and refunds it', () => {
    const state = game();
    const cash = state.cash;
    const before = takeSnapshot(state);
    placeBuilding(state, 'rack_basic', 3, 3);
    const entry = makeEntry(state, before, 'build')!;
    applyUndo(state, entry);
    expect(getBuildingAt(state, 3, 3)).toBeUndefined();
    expect(state.cash).toBe(cash);
  });

  it('undoing a sale brings it back and takes the refund back', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 3, 3);
    const cash = state.cash;
    const before = takeSnapshot(state);
    sellBuilding(state, 3, 3);
    applyUndo(state, makeEntry(state, before, 'sell')!);
    expect(getBuildingAt(state, 3, 3)).toBeDefined();
    expect(state.cash).toBe(cash);
  });

  it('an action that changed nothing is not recorded', () => {
    const state = game();
    const before = takeSnapshot(state);
    expect(makeEntry(state, before, 'nothing')).toBeNull();
  });
});

describe('group moves', () => {
  it('moves a group by an offset, all or nothing', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 2, 2);
    placeBuilding(state, 'rack_basic', 3, 2);
    placeBuilding(state, 'rack_basic', 6, 2);
    const ids = [getBuildingAt(state, 2, 2)!.id, getBuildingAt(state, 3, 2)!.id];
    // Shifting right by one is fine: the group may move into its own tiles.
    expect(moveGroup(state, ids, 1, 0).ok).toBe(true);
    expect(getBuildingAt(state, 4, 2)).toBeDefined();
    // Blocked by the rack at x=6: nothing moves.
    expect(moveGroup(state, ids, 2, 0)).toEqual({ ok: false, reason: 'occupied' });
    expect(getBuildingAt(state, 3, 2)!.id).toBe(ids[0]);
  });
});

describe('save v9', () => {
  it('round-trips research, events, legacy, history and the overdraft clock', () => {
    const state = game();
    startResearch(state, 'r_crm');
    triggerEvent(state, 'heatwave');
    state.legacy = { points: 7, sales: 2 };
    run(state, CONFIG.history.sampleTicks);
    state.overdrawnSince = 12;
    const loaded = deserialize(serialize(state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.research.current?.id).toBe('r_crm');
    expect(loaded.state.events.active.map((e) => e.kind)).toEqual(['heatwave']);
    expect(loaded.state.legacy).toEqual({ points: 7, sales: 2 });
    expect(loaded.state.history.samples).toHaveLength(1);
    expect(loaded.state.overdrawnSince).toBe(12);
    expect(costBreakdown(loaded.state).total).toBeCloseTo(costBreakdown(state).total);
  });
});
