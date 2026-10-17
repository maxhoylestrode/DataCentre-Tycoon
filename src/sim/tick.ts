import { CONFIG } from '../config';
import { refreshOffers } from './contractBoard';
import { finishContracts, recordService } from './contracts';
import { costBreakdown, incomeBreakdown } from './economy';
import { stepEvents } from './events';
import { failOverheatedRacks, stepHeat } from './heat';
import { recordHistory } from './history';
import { stepResearch } from './research';
import { stepClients, stepStaff } from './people';
import { powerEfficiency, stepBattery } from './power';
import { chargeTax, closeTaxDay, stepEndOfLife } from './pressure';
import { stepReputation } from './reputation';
import { stepSales } from './sales';
import { refreshCandidates, stepTraining } from './staff';
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
  stepTraining(state);
  stepStaff(state);
  stepClients(state);
  stepSales(state);
  stepHeat(state, powerEfficiency(state));
  failOverheatedRacks(state);
  stepEndOfLife(state);

  const income = incomeBreakdown(state);
  const total = income.walkIn + income.contracts;
  const costs = costBreakdown(state);
  const net = total - costs.total;
  state.cash += net;
  state.progress.stats.contractIncome += income.contracts;
  state.progress.stats.overheadPaid += costs.overhead;
  stepBattery(state);
  recordService(state, income.allocation, income.contractEfficiency);
  recordTick(state, total, net);
  const tax = chargeTax(state);
  recordHistory(state, income, costs, tax);
  stepReputation(state, income.efficiency);
  stepResearch(state);
  stepEvents(state, total);

  state.tick += 1;
  finishContracts(state);
  if (state.tick % CONFIG.time.ticksPerDay === 0) {
    closeTaxDay(state);
    endDay(state);
  }
  refreshCandidates(state);

  // Below the overdraft limit you have a grace period to recover (sell
  // something, cancel a contract); still below at the end of it, you're bankrupt.
  if (state.cash < -CONFIG.economy.overdraftLimit) {
    state.overdrawnSince ??= state.tick;
    if (state.tick - state.overdrawnSince >= CONFIG.economy.bankruptcyGraceTicks) {
      state.bankrupt = true;
      return;
    }
  } else {
    state.overdrawnSince = null;
  }
  checkProgress(state);
  refreshOffers(state);
}
