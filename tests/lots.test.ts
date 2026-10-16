import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buyLot, placeBuilding, placeFloor, placeWall } from '../src/sim/commands';
import { LOTS, STARTING_LOT } from '../src/sim/content/lots';
import { costsPerTick } from '../src/sim/economy';
import { stepHeat } from '../src/sim/heat';
import { isOwnedTile, MAP_HEIGHT, MAP_WIDTH, nextLotPrice, purchasableLots } from '../src/sim/lots';
import { totalXpForLevel } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, type GameState, tempAt } from '../src/sim/state';

const L = CONFIG.lots;

function richGame(): GameState {
  const state = createInitialState();
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(10);
  return state;
}

describe('rooms', () => {
  it('a new game is the whole map, owning only the starting room', () => {
    const state = createInitialState();
    expect([state.width, state.height]).toEqual([MAP_WIDTH, MAP_HEIGHT]);
    expect(state.ownedLots).toEqual([STARTING_LOT]);
    expect(isOwnedTile(state, 0, 0)).toBe(true);
    expect(isOwnedTile(state, L.width - 1, L.height - 1)).toBe(true);
    expect(isOwnedTile(state, L.width, 0)).toBe(false);
  });

  it('you can only build in rooms you own', () => {
    const state = richGame();
    expect(placeBuilding(state, 'rack_basic', L.width + 2, 2)).toEqual({ ok: false, reason: 'not_owned' });
    expect(placeFloor(state, 'floor_vent', L.width + 2, 2).ok).toBe(false);
    buyLot(state, 'lot_1_0');
    expect(placeBuilding(state, 'rack_basic', L.width + 2, 2)).toEqual({ ok: true });
  });

  it('only rooms next to one you own can be bought', () => {
    const state = richGame();
    expect(purchasableLots(state).map((l) => l.id).sort()).toEqual(['lot_0_1', 'lot_1_0']);
    expect(buyLot(state, 'lot_2_0')).toEqual({ ok: false, reason: 'not_adjacent' });
    buyLot(state, 'lot_1_0');
    expect(buyLot(state, 'lot_2_0')).toEqual({ ok: true });
  });

  it('each room costs more than the last', () => {
    const state = richGame();
    const paid: number[] = [];
    for (const id of ['lot_1_0', 'lot_0_1', 'lot_1_1', 'lot_2_0', 'lot_2_1', 'lot_0_2']) {
      const before = state.cash;
      expect(buyLot(state, id)).toEqual({ ok: true });
      paid.push(before - state.cash);
    }
    expect(paid).toEqual([...L.prices]);
    expect(nextLotPrice(state)).toBe(L.prices.at(-1)! * 2);
    expect(state.ownedLots).toHaveLength(LOTS.length);
  });

  it('needs enough cash, and can’t buy a room twice', () => {
    const state = richGame();
    state.cash = L.prices[0]! - 1;
    expect(buyLot(state, 'lot_1_0')).toEqual({ ok: false, reason: 'insufficient_funds' });
    state.cash = 10_000_000;
    buyLot(state, 'lot_1_0');
    expect(buyLot(state, 'lot_1_0')).toEqual({ ok: false, reason: 'owned' });
  });

  it('rent is charged per room', () => {
    const state = richGame();
    const before = costsPerTick(state);
    buyLot(state, 'lot_1_0');
    expect(costsPerTick(state) - before).toBeCloseTo(CONFIG.economy.rentPerTick * CONFIG.economy.runningCostMultiplier);
  });

  it('heat never crosses the wall between rooms', () => {
    const state = richGame();
    buyLot(state, 'lot_1_0');
    for (let y = 5; y <= 7; y++) for (let x = L.width - 3; x < L.width; x++) placeBuilding(state, 'rack_basic', x, y);
    for (let i = 0; i < 500; i++) stepHeat(state, 1);
    expect(tempAt(state, L.width - 1, 6)).toBeGreaterThan(CONFIG.heat.ambient + 5);
    expect(tempAt(state, L.width, 6)).toBeCloseTo(CONFIG.heat.ambient, 5);
  });

  it('a doorway or glass can go in the wall between rooms, but not another plain wall', () => {
    const state = richGame();
    buyLot(state, 'lot_1_0');
    expect(placeWall(state, 'wall_basic', L.width, 5, 'v')).toEqual({ ok: false, reason: 'occupied' });
    expect(placeWall(state, 'wall_door', L.width, 5, 'v')).toEqual({ ok: true });
    // Not into a room you don't own yet.
    expect(placeWall(state, 'wall_door', 5, L.height, 'h').ok).toBe(false);
  });

  it('saves keep owned rooms; old single-room saves grow onto the full map', () => {
    const state = richGame();
    buyLot(state, 'lot_0_1');
    const loaded = deserialize(serialize(state));
    expect(loaded.ok && loaded.state.ownedLots).toEqual([STARTING_LOT, 'lot_0_1']);

    // A v6 save from before rooms: a 20×14 map with a rack and some heat.
    const old = createInitialState(L.width, L.height);
    placeBuilding(old, 'rack_basic', 3, 3);
    old.temps[3 * L.width + 3] = 30;
    const save = JSON.parse(serialize(old));
    save.version = 6;
    delete save.data.ownedLots;
    const grown = deserialize(JSON.stringify(save));
    if (!grown.ok) throw new Error(grown.error);
    expect([grown.state.width, grown.state.height]).toEqual([MAP_WIDTH, MAP_HEIGHT]);
    expect(grown.state.ownedLots).toEqual([STARTING_LOT]);
    expect(grown.state.buildings[0]).toMatchObject({ x: 3, y: 3 });
    expect(tempAt(grown.state, 3, 3)).toBe(30);
  });
});
