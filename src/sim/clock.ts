// Fixed-step loop: turns real elapsed time into whole sim ticks, so the sim
// runs at the same rate whatever the frame rate.

import { CONFIG } from '../config';
import type { GameState } from './state';
import { tick } from './tick';

export interface Clock {
  // Fractional ticks carried over between frames.
  accumulator: number;
}

export function createClock(): Clock {
  return { accumulator: 0 };
}

// Returns the number of ticks run.
export function advanceClock(clock: Clock, state: GameState, realSeconds: number): number {
  if (state.paused || state.bankrupt) {
    clock.accumulator = 0;
    return 0;
  }

  clock.accumulator += realSeconds * CONFIG.time.ticksPerSecondAt1x * state.speed;
  let ran = 0;
  while (clock.accumulator >= 1 && ran < CONFIG.time.maxTicksPerFrame && !state.bankrupt) {
    tick(state);
    clock.accumulator -= 1;
    ran += 1;
  }
  // Drop any backlog past the cap rather than trying to catch up later.
  if (ran === CONFIG.time.maxTicksPerFrame || state.bankrupt) clock.accumulator = 0;
  return ran;
}
