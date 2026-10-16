import { totalXpForLevel } from '../src/sim/progression';
import { UNLOCKS } from '../src/sim/content/unlocks';
import { createInitialState, type GameState } from '../src/sim/state';

// A new game with every unlock available, for tests about other systems.
// Balance tests use createInitialState so they play the real level-1 start.
export function testState(width?: number, height?: number): GameState {
  const state = createInitialState(width, height);
  state.progress.xp = totalXpForLevel(Math.max(...UNLOCKS.map((u) => u.level)));
  return state;
}
