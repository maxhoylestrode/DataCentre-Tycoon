import { describe, expect, it } from 'vitest';
import { testState } from './helpers';
import { CONFIG } from '../src/config';
import { placeBuilding } from '../src/sim/commands';
import { deserialize, SAVE_VERSION, serialize } from '../src/sim/save';
import { type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';

function playedGame(): GameState {
  const state = testState(12, 8);
  state.cash = 50_000;
  placeBuilding(state, 'rack_basic', 1, 1);
  placeBuilding(state, 'rack_basic', 2, 1);
  placeBuilding(state, 'power_basic', 5, 5);
  placeBuilding(state, 'cooling_fan', 3, 2);
  for (let i = 0; i < 300; i++) tick(state);
  getBuildingAt(state, 2, 1)!.status = 'failed';
  state.speed = 4;
  state.paused = true;
  return state;
}

function load(text: string): GameState {
  const result = deserialize(text);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

// Parse a save, let the test edit its JSON, then serialise it again.
function tamper(state: GameState, edit: (save: any) => void): string {
  const save = JSON.parse(serialize(state));
  edit(save);
  return JSON.stringify(save);
}

describe('save and load', () => {
  it('round-trips a played game', () => {
    const state = playedGame();
    const loaded = load(serialize(state));
    expect(loaded.width).toBe(12);
    expect(loaded.height).toBe(8);
    expect(loaded.cash).toBeCloseTo(state.cash);
    expect(loaded.tick).toBe(state.tick);
    expect(loaded.speed).toBe(4);
    expect(loaded.paused).toBe(true);
    expect(loaded.nextBuildingId).toBe(state.nextBuildingId);
    expect(loaded.buildings).toEqual(state.buildings);
    loaded.temps.forEach((t, i) => expect(t).toBeCloseTo(state.temps[i]!, 1));
  });

  it('a loaded game carries on exactly like the original', () => {
    const original = playedGame();
    original.paused = false;
    // Exact temps so both games are identical from here.
    const copy = load(serialize(original));
    copy.temps = [...original.temps];
    for (let i = 0; i < 500; i++) {
      tick(original);
      tick(copy);
    }
    expect(copy.cash).toBeCloseTo(original.cash, 6);
    expect(copy.buildings).toEqual(original.buildings);
  });

  it('stores the version number and only ids and numbers for buildings', () => {
    const save = JSON.parse(serialize(playedGame()));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.data.buildings[0]).toEqual({
      id: expect.any(Number),
      kind: 'rack_basic',
      x: 1,
      y: 1,
      builtAtTick: 0,
      status: 'ok',
      repairDoneTick: null,
      upgrade: 0,
    });
    // No copies of content definitions (names, costs) in the save.
    for (const b of save.data.buildings) {
      expect(Object.keys(b)).not.toContain('name');
      expect(Object.keys(b)).not.toContain('cost');
    }
    expect(JSON.stringify(save.data.buildings)).not.toContain(CONFIG.buildings.rack_basic.name);
  });

  it('drops buildings with unknown ids and keeps the rest', () => {
    const text = tamper(playedGame(), (save) => {
      save.data.buildings.push({ id: 99, kind: 'rack_quantum', x: 7, y: 7, builtAtTick: 0, status: 'ok' });
    });
    const loaded = load(text);
    expect(loaded.buildings.map((b) => b.kind)).not.toContain('rack_quantum');
    expect(loaded.buildings).toHaveLength(4);
    expect(loaded.nextBuildingId).toBeGreaterThan(Math.max(...loaded.buildings.map((b) => b.id)));
  });

  it('drops buildings that are off the grid or share a tile', () => {
    const text = tamper(playedGame(), (save) => {
      save.data.buildings.push({ id: 50, kind: 'rack_basic', x: 40, y: 1, builtAtTick: 0, status: 'ok' });
      save.data.buildings.push({ id: 51, kind: 'rack_basic', x: 1, y: 1, builtAtTick: 0, status: 'ok' });
    });
    expect(load(text).buildings).toHaveLength(4);
  });

  it('fills missing or invalid fields with new-game defaults', () => {
    const text = tamper(playedGame(), (save) => {
      delete save.data.cash;
      save.data.speed = 3;
      save.data.temps = 'hot';
    });
    const loaded = load(text);
    expect(loaded.cash).toBe(CONFIG.economy.startingCash);
    expect(loaded.speed).toBe(1);
    expect(loaded.temps.every((t) => t === CONFIG.heat.ambient)).toBe(true);
  });

  it('rejects text that is not a save', () => {
    expect(deserialize('not json').ok).toBe(false);
    expect(deserialize('{"hello":"world"}').ok).toBe(false);
    expect(deserialize('[]').ok).toBe(false);
  });

  it('round-trips progression', () => {
    const state = playedGame();
    state.progress.xp = 1234;
    state.progress.stats.repairs = 3;
    const loaded = load(serialize(state));
    expect(loaded.progress).toEqual(state.progress);
  });

  it('ignores goal and achievement ids that no longer exist', () => {
    const text = tamper(playedGame(), (save) => {
      save.data.progress.completedGoals.push('retired_goal', 'first_rack');
      save.data.progress.achievements.push('retired_achievement');
    });
    const loaded = load(text);
    expect(loaded.progress.completedGoals).not.toContain('retired_goal');
    expect(loaded.progress.completedGoals.filter((id) => id === 'first_rack')).toHaveLength(1);
    expect(loaded.progress.achievements).not.toContain('retired_achievement');
  });

  it('rejects saves from a newer version of the game', () => {
    const text = tamper(playedGame(), (save) => (save.version = SAVE_VERSION + 1));
    const result = deserialize(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer version/);
  });
});

describe('contracts in saves', () => {
  it('round-trips offers, active contracts, history and the RNG seed', () => {
    const state = playedGame();
    state.contracts.offers.push({
      id: 7, customerType: 'startup', name: 'Pixel Labs', racks: 2, days: 3,
      payPerRackPerTick: 4.2, sla: 0.97, bonus: 500, penalty: 800, xp: 150,
    });
    state.contracts.active.push({
      id: 6, customerType: 'retired_type', name: 'Old Co', racks: 1, days: 2, payPerRackPerTick: 3,
      sla: 0.95, bonus: 100, penalty: 200, xp: 80, startTick: 10, endTick: 2890,
      servedRackTicks: 250, promisedRackTicks: 290,
    });
    state.contracts.history.push({ name: 'Done Ltd', outcome: 'completed', uptime: 1, cash: 300, xp: 80 });
    state.contracts.nextId = 8;
    state.rngSeed = 12345;

    const loaded = load(serialize(state));
    expect(loaded.contracts).toEqual(state.contracts);
    expect(loaded.rngSeed).toBe(12345);
  });

  it('drops malformed contract entries', () => {
    const text = tamper(playedGame(), (save) => {
      save.data.contracts.offers.push({ id: 3, name: 'Broken', customerType: 'startup', racks: -1 });
      save.data.contracts.active.push({ id: 4, name: 'No dates', customerType: 'startup', racks: 1, days: 1, payPerRackPerTick: 1, sla: 0.9 });
    });
    const loaded = load(text);
    expect(loaded.contracts.offers.find((o) => o.name === 'Broken')).toBeUndefined();
    expect(loaded.contracts.active).toHaveLength(0);
  });
});

describe('migrations', () => {
  // A real save written by the Milestone 3 build (format v1), trimmed to a 4x3 room.
  const V1_SAVE = JSON.stringify({
    game: 'datacentre-tycoon',
    version: 1,
    savedAt: '2026-10-16T21:00:00.000Z',
    data: {
      width: 4,
      height: 3,
      cash: 2500,
      tick: 3000,
      speed: 2,
      paused: false,
      bankrupt: false,
      nextBuildingId: 5,
      buildings: [
        { id: 1, kind: 'rack_basic', x: 0, y: 0, builtAtTick: 0, status: 'ok', repairDoneTick: null },
        { id: 2, kind: 'rack_basic', x: 2, y: 0, builtAtTick: 10, status: 'ok', repairDoneTick: null },
        { id: 3, kind: 'rack_basic', x: 0, y: 2, builtAtTick: 20, status: 'failed', repairDoneTick: null },
        { id: 4, kind: 'power_basic', x: 3, y: 2, builtAtTick: 30, status: 'ok', repairDoneTick: null },
      ],
      temps: new Array(12).fill(25),
    },
  });

  it('loads a v1 save with everything kept and fresh progression', () => {
    const state = load(V1_SAVE);
    expect(state.cash).toBe(2500);
    expect(state.tick).toBe(3000);
    expect(state.buildings).toHaveLength(4);
    expect(state.progress.xp).toBe(0);
    expect(state.progress.completedGoals).toEqual([]);
  });

  it('a migrated game catches up on goals it already meets', () => {
    const state = load(V1_SAVE);
    tick(state);
    expect(state.progress.completedGoals).toEqual(expect.arrayContaining(['first_rack', 'three_racks']));
    expect(state.progress.xp).toBeGreaterThan(0);
  });

  it('re-saves a migrated game at the current version', () => {
    expect(JSON.parse(serialize(load(V1_SAVE))).version).toBe(SAVE_VERSION);
  });

  it('migrates older buildings to upgrade level 0, and clamps levels above the max', () => {
    expect(load(V1_SAVE).buildings.every((b) => b.upgrade === 0)).toBe(true);
    const text = tamper(playedGame(), (save) => (save.data.buildings[0].upgrade = 99));
    expect(load(text).buildings[0]!.upgrade).toBe(CONFIG.upgrades.maxLevel);
  });

  it('migrates a v2 save to no contracts and a deterministic seed', () => {
    const v2 = JSON.parse(V1_SAVE);
    v2.version = 2;
    v2.data.progress = { xp: 500, completedGoals: ['first_rack'], achievements: [], stats: { built: 4 } };
    const a = load(JSON.stringify(v2));
    const b = load(JSON.stringify(v2));
    expect(a.progress.xp).toBe(500);
    expect(a.progress.stats.built).toBe(4);
    expect(a.progress.stats.contractsSigned).toBe(0);
    expect(a.contracts.active).toEqual([]);
    expect(a.rngSeed).toBe(b.rngSeed);
  });
});
