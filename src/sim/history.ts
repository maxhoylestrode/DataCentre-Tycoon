// Stats history for the graphs: per-tick values averaged over each game hour.

import { CONFIG } from '../config';
import { powerDraw, powerSupply } from './power';
import { type GameState, racksOf } from './state';

export function recordHistory(state: GameState, income: number, costs: number, efficiency: number): void {
  const acc = state.history.acc;
  acc.ticks += 1;
  acc.income += income;
  acc.costs += costs;
  acc.uptime += efficiency;
  // Power is cheap enough to sample every few ticks only.
  if (acc.ticks % 5 === 1) {
    acc.powerDraw += powerDraw(state) * 5;
    acc.powerSupply += powerSupply(state) * 5;
  }
  if (acc.ticks < CONFIG.history.sampleTicks) return;
  const n = acc.ticks;
  state.history.samples.push({
    tick: state.tick,
    income: acc.income / n,
    costs: acc.costs / n,
    cash: state.cash,
    powerDraw: acc.powerDraw / n,
    powerSupply: acc.powerSupply / n,
    uptime: acc.uptime / n,
    racks: racksOf(state).length,
  });
  const extra = state.history.samples.length - CONFIG.history.maxSamples;
  if (extra > 0) state.history.samples.splice(0, extra);
  state.history.acc = { ticks: 0, income: 0, costs: 0, powerDraw: 0, powerSupply: 0, uptime: 0 };
}
