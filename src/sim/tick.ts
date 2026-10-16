import { CONFIG } from '../config';
import { costsPerTick, incomePerTick } from './economy';
import { failOverheatedRacks, stepHeat } from './heat';
import { powerEfficiency } from './power';
import { checkProgress, endDay, recordTick } from './progression';
import type { GameState } from './state';

function completeRepairs(state: GameState): void {
  for (const b of state.buildings) {
    if (b.status === 'repairing' && b.repairDoneTick !== null && state.tick >= b.repairDoneTick) {
      b.status = 'ok';
      b.repairDoneTick = null;
    }
  }
}

// Advances the sim by one tick (one game minute). Does nothing once bankrupt.
export function tick(state: GameState): void {
  if (state.bankrupt) return;

  completeRepairs(state);
  stepHeat(state, powerEfficiency(state));
  failOverheatedRacks(state);

  const income = incomePerTick(state);
  const net = income - costsPerTick(state);
  state.cash += net;
  recordTick(state, income, net);

  state.tick += 1;
  if (state.tick % CONFIG.time.ticksPerDay === 0) endDay(state);

  if (state.cash < -CONFIG.economy.overdraftLimit) {
    state.bankrupt = true;
    return;
  }
  checkProgress(state);
}
