import { totalXpForLevel } from '../src/sim/progression';
import { UNLOCKS } from '../src/sim/content/unlocks';
import { UPLINKS } from '../src/sim/content/uplinks';
import { createInitialState, type GameState } from '../src/sim/state';

// A new game with every unlock available and a fast internet line, for
// tests about other systems. Balance tests use createInitialState so
// they play the real level-1 start.
export function testState(width?: number, height?: number): GameState {
  const state = createInitialState(width, height);
  state.progress.xp = totalXpForLevel(Math.max(...UNLOCKS.map((u) => u.level)));
  fastNetwork(state);
  return state;
}

// So bandwidth never limits a test that isn't about bandwidth. 10 Gbps
// covers hundreds of stock racks; the fastest lines' rental would swamp
// tests about money.
export function fastNetwork(state: GameState): void {
  state.uplink = UPLINKS.find((u) => u.id === 'uplink_10g')!.id;
}
