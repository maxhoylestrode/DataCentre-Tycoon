import { CONFIG } from '../config';
import { refreshOffers } from './contractBoard';
import { finishContracts, recordService } from './contracts';
import { costsPerTick, incomeBreakdown } from './economy';
import { failOverheatedRacks, stepHeat } from './heat';
import { stepClients, stepStaff } from './people';
import { powerEfficiency } from './power';
import { checkProgress, endDay, recordTick } from './progression';
import type { GameState } from './state';

// Timed repairs (when staff aren't simulated; otherwise engineers do them).
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
  stepStaff(state);
  stepClients(state);
  stepHeat(state, powerEfficiency(state));
  failOverheatedRacks(state);

  const income = incomeBreakdown(state);
  const total = income.walkIn + income.contracts;
  const net = total - costsPerTick(state);
  state.cash += net;
  state.progress.stats.contractIncome += income.contracts;
  recordService(state, income.allocation, income.efficiency);
  recordTick(state, total, net);

  state.tick += 1;
  finishContracts(state);
  if (state.tick % CONFIG.time.ticksPerDay === 0) endDay(state);

  if (state.cash < -CONFIG.economy.overdraftLimit) {
    state.bankrupt = true;
    return;
  }
  checkProgress(state);
  refreshOffers(state);
}
