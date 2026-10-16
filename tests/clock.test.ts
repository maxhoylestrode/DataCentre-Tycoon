import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { advanceClock, createClock } from '../src/sim/clock';
import { setSpeed, togglePause } from '../src/sim/commands';
import { createInitialState } from '../src/sim/state';

const TPS = CONFIG.time.ticksPerSecondAt1x;

describe('clock', () => {
  it('runs ticksPerSecondAt1x ticks per real second at 1x', () => {
    const state = createInitialState(5, 5);
    expect(advanceClock(createClock(), state, 1)).toBe(TPS);
    expect(state.tick).toBe(TPS);
  });

  it('scales with speed', () => {
    const state = createInitialState(5, 5);
    setSpeed(state, 4);
    expect(advanceClock(createClock(), state, 1)).toBe(TPS * 4);
  });

  it('carries fractional ticks across frames', () => {
    const state = createInitialState(5, 5);
    const clock = createClock();
    const frame = 0.6 / TPS; // 0.6 of a tick per frame
    expect(advanceClock(clock, state, frame)).toBe(0);
    expect(advanceClock(clock, state, frame)).toBe(1);
    expect(advanceClock(clock, state, frame)).toBe(0);
    expect(advanceClock(clock, state, frame)).toBe(1);
  });

  it('runs no ticks while paused', () => {
    const state = createInitialState(5, 5);
    togglePause(state);
    expect(advanceClock(createClock(), state, 5)).toBe(0);
    expect(state.tick).toBe(0);
  });

  it('setting a speed unpauses', () => {
    const state = createInitialState(5, 5);
    togglePause(state);
    setSpeed(state, 2);
    expect(state.paused).toBe(false);
    expect(state.speed).toBe(2);
  });

  it('caps ticks per frame and drops the backlog', () => {
    const state = createInitialState(5, 5);
    const clock = createClock();
    expect(advanceClock(clock, state, 1000)).toBe(CONFIG.time.maxTicksPerFrame);
    expect(clock.accumulator).toBe(0);
  });

  it('runs no ticks once bankrupt', () => {
    const state = createInitialState(5, 5);
    state.bankrupt = true;
    expect(advanceClock(createClock(), state, 1)).toBe(0);
  });
});
