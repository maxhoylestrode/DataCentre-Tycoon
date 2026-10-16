import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buyStyle, placeBuilding, useStyle } from '../src/sim/commands';
import { refreshOffers } from '../src/sim/contractBoard';
import { ROOM_STYLES } from '../src/sim/content/styles';
import { prestigeExtraOffers, prestigeOf, prestigePayBonus } from '../src/sim/prestige';
import { totalXpForLevel } from '../src/sim/progression';
import { createInitialState, type GameState } from '../src/sim/state';

const P = CONFIG.prestige;

function stateAtLevel(level: number, seed = 1): GameState {
  const state = createInitialState(20, 14, seed);
  state.cash = 10_000_000;
  state.progress.xp = totalXpForLevel(level);
  return state;
}

describe('prestige', () => {
  it('a new game has none', () => {
    expect(prestigeOf(createInitialState(10, 10))).toBe(0);
  });

  it('decorations add their prestige', () => {
    const state = stateAtLevel(15);
    placeBuilding(state, 'plant_small', 0, 0);
    placeBuilding(state, 'sign_company', 1, 0);
    expect(prestigeOf(state)).toBe(CONFIG.buildings.plant_small.prestige + CONFIG.buildings.sign_company.prestige);
  });

  it('only active room styles count', () => {
    const state = stateAtLevel(20);
    const dark = ROOM_STYLES.find((s) => s.id === 'floor_dark')!;
    const white = ROOM_STYLES.find((s) => s.id === 'floor_raised_white')!;
    buyStyle(state, dark.id);
    expect(prestigeOf(state)).toBe(dark.prestige);
    buyStyle(state, white.id);
    expect(prestigeOf(state)).toBe(white.prestige);
  });

  it('raises contract pay up to a cap', () => {
    const state = stateAtLevel(20);
    placeBuilding(state, 'server_showcase', 0, 0);
    expect(prestigePayBonus(state)).toBeCloseTo(prestigeOf(state) * P.payBonusPerPoint);
    for (let x = 1; x < 20; x++) placeBuilding(state, 'server_showcase', x, 0);
    expect(prestigePayBonus(state)).toBe(P.maxPayBonus);
  });

  it('adds contract offers at thresholds, up to a cap', () => {
    const state = stateAtLevel(20);
    expect(prestigeExtraOffers(state)).toBe(0);
    for (let x = 0; x < 2; x++) placeBuilding(state, 'server_showcase', x, 0); // 30 prestige
    expect(prestigeExtraOffers(state)).toBe(1);
    // Placing the showcases already rolled today's board; force a fresh one.
    state.contracts.offersDay = 0;
    refreshOffers(state);
    expect(state.contracts.offers).toHaveLength(CONFIG.contracts.offersPerDay + 1);
    for (let x = 2; x < 20; x++) placeBuilding(state, 'server_showcase', x, 0);
    expect(prestigeExtraOffers(state)).toBe(P.maxExtraOffers);
  });

  it('offers pay more with prestige', () => {
    const plain = stateAtLevel(20, 5);
    const fancy = stateAtLevel(20, 5);
    for (let x = 0; x < 2; x++) placeBuilding(fancy, 'plant_small', x, 0);
    // Placing rolls the board, which also advances the seed; reset both alike.
    fancy.rngSeed = plain.rngSeed;
    fancy.contracts = structuredClone(plain.contracts);
    refreshOffers(plain);
    refreshOffers(fancy);
    const a = plain.contracts.offers[0]!;
    const b = fancy.contracts.offers[0]!;
    expect(b.payPerRackPerTick).toBeGreaterThan(a.payPerRackPerTick);
  });
});

describe('room styles', () => {
  it('buying charges once, then switching is free', () => {
    const state = stateAtLevel(10);
    const navy = ROOM_STYLES.find((s) => s.id === 'wall_navy')!;
    const cash = state.cash;
    expect(buyStyle(state, navy.id)).toEqual({ ok: true });
    expect(state.cash).toBe(cash - navy.cost);
    expect(state.style.wall).toBe(navy.id);
    expect(useStyle(state, 'wall_grey')).toEqual({ ok: true });
    expect(buyStyle(state, navy.id)).toEqual({ ok: true });
    expect(state.cash).toBe(cash - navy.cost);
  });

  it('need the room styles mechanic and the style’s level', () => {
    const early = stateAtLevel(1);
    expect(buyStyle(early, 'wall_navy')).toEqual({ ok: false, reason: 'locked' });
    const mid = stateAtLevel(5);
    expect(buyStyle(mid, 'wall_brick')).toEqual({ ok: false, reason: 'style_locked' });
  });

  it('can’t use a style you don’t own', () => {
    expect(useStyle(stateAtLevel(20), 'floor_carbon')).toEqual({ ok: false, reason: 'not_owned' });
  });
});
