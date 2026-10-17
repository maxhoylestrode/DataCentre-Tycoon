import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildTicks, isOverdue } from '../src/sim/buildings';
import {
  fireStaff,
  hireStaff,
  moveBuilding,
  paintZone,
  placeBuilding,
  placeWall,
  repairRack,
  rotateBuilding,
  signContract,
  upgradePart,
} from '../src/sim/commands';
import { refreshOffers } from '../src/sim/contractBoard';
import { costBreakdown, incomeBreakdown } from '../src/sim/economy';
import { findPath, frontDoors, walkGrid } from '../src/sim/paths';
import { receptionProblem, staffSpeedFactor } from '../src/sim/people';
import { totalXpForLevel } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { hasStorage, staffCapacity } from '../src/sim/zones';
import { fastNetwork } from './helpers';

// A people-simulated game in one 20×14 room.
function game(level = 20): GameState {
  const state = createInitialState(20, 14, 1, { staffSim: true });
  state.cash = 10_000_000;
  state.progress.xp = totalXpForLevel(level);
  fastNetwork(state);
  return state;
}

function runUntil(state: GameState, done: () => boolean, max = 5000): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    tick(state);
  }
  throw new Error('took too long');
}

describe('moving buildings', () => {
  it('moves a building for free, keeping its id, parts, upgrades and age', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 3, 3);
    const rack = getBuildingAt(state, 3, 3)!;
    rack.status = 'ok';
    upgradePart(state, 3, 3, 'cpu');
    const before = { ...rack, parts: { ...rack.parts } };
    const cash = state.cash;
    expect(moveBuilding(state, 3, 3, 8, 5, 2).ok).toBe(true);
    expect(getBuildingAt(state, 3, 3)).toBeUndefined();
    const moved = getBuildingAt(state, 8, 5)!;
    expect(moved.id).toBe(before.id);
    expect(moved.parts).toEqual(before.parts);
    expect(moved.refreshedAtTick).toBe(before.refreshedAtTick);
    expect(moved.rot).toBe(2);
    expect(state.cash).toBe(cash);
  });

  it('refuses occupied tiles, unowned tiles and empty sources', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 3, 3);
    placeBuilding(state, 'rack_basic', 5, 3);
    expect(moveBuilding(state, 3, 3, 5, 3)).toEqual({ ok: false, reason: 'occupied' });
    expect(moveBuilding(state, 3, 3, 30, 3)).toMatchObject({ ok: false });
    expect(moveBuilding(state, 9, 9, 10, 10)).toEqual({ ok: false, reason: 'empty' });
    // Dropping it back on its own tile is fine (just a rotate).
    expect(moveBuilding(state, 3, 3, 3, 3, 1).ok).toBe(true);
  });

  it('an engineer on the way to build it re-routes to the new spot', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 12, 8);
    runUntil(state, () => state.staff[0]!.task !== null);
    moveBuilding(state, 12, 8, 4, 4);
    expect(state.staff[0]!.task).toBeNull();
    runUntil(state, () => getBuildingAt(state, 4, 4)!.status === 'ok');
  });
});

describe('construction', () => {
  it('a new game has the founder engineer, who is free', () => {
    const state = game(1);
    expect(state.staff).toHaveLength(1);
    expect(state.staff[0]).toMatchObject({ role: 'engineer', founder: true });
    expect(costBreakdown(state).wages).toBe(0);
  });

  it('new buildings wait for an engineer, who walks over and builds them', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 10, 6);
    const rack = getBuildingAt(state, 10, 6)!;
    expect(rack.status).toBe('building');
    expect(rack.buildRemaining).toBe(buildTicks('rack_basic'));
    expect(incomeBreakdown(state).allocation.walkIn).toHaveLength(0);
    const took = runUntil(state, () => rack.status === 'ok');
    // Walking ~13 tiles plus the build itself (slower without a storage room).
    expect(took).toBeGreaterThan(buildTicks('rack_basic'));
    // Customers start filling it from the tick it was finished.
    expect(rack.builtAtTick).toBe(state.tick - 1);
  });

  it('more engineers build more at once', () => {
    const one = game();
    const two = game();
    hireStaff(two, 'engineer');
    for (const s of [one, two]) for (let i = 0; i < 4; i++) placeBuilding(s, 'rack_basic', 4 + i * 3, 6);
    const tOne = runUntil(one, () => one.buildings.every((b) => b.status === 'ok'));
    const tTwo = runUntil(two, () => two.buildings.every((b) => b.status === 'ok'));
    expect(tTwo).toBeLessThan(tOne);
  });

  it('a storage room with shelving speeds up building', () => {
    const plain = game();
    const stocked = game();
    for (let x = 0; x < 2; x++) paintZone(stocked, 'storage', x, 12);
    placeBuilding(stocked, 'shelving', 0, 12);
    runUntil(stocked, () => getBuildingAt(stocked, 0, 12)!.status === 'ok');
    expect(hasStorage(stocked)).toBe(true);
    // Same starting spot for both engineers, so only the work speed differs.
    for (const s of [plain, stocked]) {
      Object.assign(s.staff[0]!, { x: 3, y: 5, path: [], task: null });
      placeBuilding(s, 'rack_basic', 3, 3);
    }
    const tPlain = runUntil(plain, () => getBuildingAt(plain, 3, 3)!.status === 'ok');
    const tStocked = runUntil(stocked, () => getBuildingAt(stocked, 3, 3)!.status === 'ok');
    expect(tStocked).toBeLessThan(tPlain);
  });

  it('engineers do repairs on site', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 6, 6);
    const rack = getBuildingAt(state, 6, 6)!;
    runUntil(state, () => rack.status === 'ok');
    rack.status = 'failed';
    repairRack(state, 6, 6);
    expect(rack.status).toBe('repairing');
    expect(rack.repairDoneTick).toBeNull();
    runUntil(state, () => rack.status === 'ok');
  });

  it('a building walled off from every engineer never gets built', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 15, 6);
    // Box the rack in on all four sides.
    placeWall(state, 'wall_basic', 15, 6, 'v');
    placeWall(state, 'wall_basic', 16, 6, 'v');
    placeWall(state, 'wall_basic', 15, 6, 'h');
    placeWall(state, 'wall_basic', 15, 7, 'h');
    for (let i = 0; i < 2000; i++) tick(state);
    expect(getBuildingAt(state, 15, 6)!.status).toBe('building');
  });
});

describe('staff', () => {
  it('hiring costs a fee now and a wage every minute; firing stops the wage', () => {
    const state = game();
    const cash = state.cash;
    expect(hireStaff(state, 'technician')).toEqual({ ok: true });
    expect(state.cash).toBe(cash - CONFIG.staff.roles.technician.hireFee);
    expect(costBreakdown(state).wages).toBeCloseTo(CONFIG.staff.roles.technician.wagePerTick);
    const tech = state.staff.find((s) => s.role === 'technician')!;
    expect(fireStaff(state, tech.id)).toEqual({ ok: true });
    expect(costBreakdown(state).wages).toBe(0);
    expect(fireStaff(state, state.staff[0]!.id)).toEqual({ ok: false, reason: 'founder' });
  });

  it('hiring unlocks at level 3', () => {
    expect(hireStaff(game(1), 'engineer')).toEqual({ ok: false, reason: 'locked' });
  });

  it('staff over capacity work slower until a staff room houses them', () => {
    const state = game();
    for (let i = 0; i < 3; i++) hireStaff(state, 'technician');
    expect(state.staff.length).toBeGreaterThan(staffCapacity(state));
    expect(staffSpeedFactor(state)).toBe(CONFIG.staff.tiredSpeed);
    for (let x = 0; x < 4; x++) paintZone(state, 'staff', x, 0);
    placeBuilding(state, 'coffee_machine', 0, 0);
    placeBuilding(state, 'break_table', 2, 0);
    runUntil(state, () => state.buildings.every((b) => b.status === 'ok'));
    expect(staffCapacity(state)).toBe(CONFIG.staff.baseCapacity + CONFIG.staff.perBreakTable);
    expect(staffSpeedFactor(state)).toBe(1);
  });

  it('staff service racks before they go overdue; with nobody to do it racks earn less', () => {
    const lazy = game();
    const kept = game();
    hireStaff(kept, 'technician');
    for (const s of [lazy, kept]) {
      placeBuilding(s, 'rack_basic', 8, 6);
      runUntil(s, () => getBuildingAt(s, 8, 6)!.status === 'ok');
    }
    // Nobody left to service the lazy company's rack (the founder would).
    lazy.staff = [];
    for (let i = 0; i < CONFIG.maintenance.intervalTicks + 200; i++) {
      tick(lazy);
      tick(kept);
    }
    expect(isOverdue(lazy, getBuildingAt(lazy, 8, 6)!)).toBe(true);
    expect(isOverdue(kept, getBuildingAt(kept, 8, 6)!)).toBe(false);
    expect(kept.progress.stats.services).toBeGreaterThan(0);
  });
});

describe('founder', () => {
  it('services racks when there is nothing to build or repair', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 8, 6);
    runUntil(state, () => getBuildingAt(state, 8, 6)!.status === 'ok');
    for (let i = 0; i < CONFIG.maintenance.intervalTicks + 200; i++) tick(state);
    expect(state.progress.stats.services).toBeGreaterThan(0);
    expect(isOverdue(state, getBuildingAt(state, 8, 6)!)).toBe(false);
  });
});

describe('walking', () => {
  it('walls block people; doors let them through', () => {
    const state = game();
    for (let y = 0; y < 14; y++) placeWall(state, 'wall_basic', 10, y, 'v');
    const reach = (): boolean => findPath(walkGrid(state), [2, 2], (x, y) => x === 15 && y === 2) !== null;
    expect(reach()).toBe(false);
    placeWall(state, 'wall_door', 10, 5, 'v');
    expect(reach()).toBe(true);
  });

  it('people walk around buildings', () => {
    const state = game();
    for (let y = 0; y < 13; y++) placeBuilding(state, 'plant_small', 10, y);
    const path = findPath(walkGrid(state), [2, 2], (x, y) => x === 15 && y === 2)!;
    expect(path.some(([x, y]) => x === 10 && y === 13)).toBe(true);
  });
});

describe('clients and reception', () => {
  function withReception(state: GameState): void {
    placeBuilding(state, 'desk_reception', 10, 10, 2); // facing north (towards y = 9)
    placeWall(state, 'door_outside', 10, 14, 'h'); // in the near wall
    runUntil(state, () => getBuildingAt(state, 10, 10)!.status === 'ok');
  }

  it('front doors only go in outside walls', () => {
    const state = game();
    expect(placeWall(state, 'door_outside', 5, 5, 'v').ok).toBe(false);
    expect(placeWall(state, 'door_outside', 5, 0, 'h')).toEqual({ ok: true });
    expect(frontDoors(state)).toEqual([{ inside: [5, 0], outside: [5, -1] }]);
  });

  it('without a front door and reception, clients can’t reach you', () => {
    const state = game();
    expect(receptionProblem(state)).toMatch(/front door/);
    placeWall(state, 'door_outside', 10, 14, 'h');
    expect(receptionProblem(state)).toMatch(/reception desk/);
  });

  it('clients walk in and queue at reception; only then can their offer be signed', () => {
    const state = game();
    withReception(state);
    for (let i = 0; i < 4; i++) placeBuilding(state, 'rack_basic', 2 + i * 2, 3);
    runUntil(state, () => state.buildings.every((b) => b.status === 'ok'));
    state.contracts.offersDay = 0;
    refreshOffers(state);
    const offer = state.contracts.offers[0]!;
    expect(offer.arrived).toBe(false);
    // One client per offer (yesterday's are on their way out).
    expect(state.clients.filter((c) => c.state !== 'leaving').length).toBe(state.contracts.offers.length);
    expect(signContract(state, offer.id)).toEqual({ ok: false, reason: 'client_not_here' });
    runUntil(state, () => offer.arrived === true);
    const client = state.clients.find((c) => c.offerId === offer.id)!;
    expect(client.state).toBe('waiting');
    // The first client stands in front of the desk.
    expect([Math.round(client.x), Math.round(client.y)]).toEqual([10, 9]);
    if (offer.racks <= 4) {
      expect(signContract(state, offer.id)).toEqual({ ok: true });
      expect(client.state).toBe('leaving');
      runUntil(state, () => !state.clients.includes(client));
    }
  });

  it('turning the desk changes where the queue forms', () => {
    const state = game();
    placeBuilding(state, 'desk_reception', 10, 10);
    rotateBuilding(state, 10, 10);
    expect(getBuildingAt(state, 10, 10)!.rot).toBe(1);
  });
});

describe('saving people', () => {
  it('round-trips staff, clients, zones, rotation and the internet line', () => {
    const state = game();
    hireStaff(state, 'technician');
    paintZone(state, 'server', 3, 3);
    placeBuilding(state, 'rack_basic', 3, 3, 3);
    const loaded = deserialize(serialize(state));
    if (!loaded.ok) throw new Error(loaded.error);
    const s = loaded.state;
    expect(s.staffSim).toBe(true);
    expect(s.staff.map((m) => m.role)).toEqual(['engineer', 'technician']);
    expect(s.zones).toEqual([{ kind: 'server', x: 3, y: 3 }]);
    expect(getBuildingAt(s, 3, 3)).toMatchObject({ rot: 3, status: 'building' });
    expect(s.uplink).toBe(state.uplink);
  });

  it('older real saves switch people on and get a founder', () => {
    const old = createInitialState(20, 14);
    placeBuilding(old, 'rack_basic', 2, 2);
    const save = JSON.parse(serialize(old));
    save.version = 7;
    for (const k of ['staffSim', 'staff', 'nextStaffId', 'clients', 'zones', 'uplink']) delete save.data[k];
    const loaded = deserialize(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.staffSim).toBe(true);
    expect(loaded.state.staff).toHaveLength(1);
    expect(loaded.state.buildings[0]!.status).toBe('ok');
  });
});
