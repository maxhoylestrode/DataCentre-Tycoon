// Seeded random numbers (mulberry32). The seed lives in GameState and is
// saved, so the same game always rolls the same results and tests are
// repeatable. Never use Math.random in the sim.

import type { GameState } from './state';

// Uniform in [0, 1). Advances the state's seed.
export function nextRandom(state: GameState): number {
  state.rngSeed = (state.rngSeed + 0x6d2b79f5) | 0;
  let t = state.rngSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Uniform in [min, max].
export function randomRange(state: GameState, min: number, max: number): number {
  return min + nextRandom(state) * (max - min);
}

// Whole number in [min, max], both inclusive.
export function randomInt(state: GameState, min: number, max: number): number {
  return Math.floor(randomRange(state, min, max + 1 - 1e-9));
}

export function pick<T>(state: GameState, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(nextRandom(state) * items.length))]!;
}
