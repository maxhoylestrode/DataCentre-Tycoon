// Reputation, 0–100, in a live world. 50 is neutral: no effect.
//
// Every game hour it drifts towards a target set by how well you run the
// place: uptime, prestige, and how many racks are down or overheating.
// Contract results and fires move it straight away. It scales walk-in
// demand, contract pay and how many clients turn up each day.

import { CONFIG } from '../config';
import { prestigeOf } from './prestige';
import { type GameState, isRunning, racksOf, tempAt } from './state';

const R = CONFIG.reputation;

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

// A sudden change (contract kept or broken, a fire). Losses scale with difficulty.
export function adjustReputation(state: GameState, delta: number): void {
  if (!state.liveWorld) return;
  const scale = delta < 0 ? CONFIG.difficulty[state.difficulty].reputationLoss : 1;
  state.reputation = clamp(state.reputation + delta * scale);
}

// Where reputation is heading, given how things are right now.
export function reputationTarget(state: GameState, uptime: number): number {
  const racks = racksOf(state);
  const n = Math.max(1, racks.length);
  const down = racks.filter((r) => r.status === 'failed' || r.status === 'repairing').length / n;
  const hot = racks.filter((r) => isRunning(r) && tempAt(state, r.x, r.y) > CONFIG.heat.warnTemp).length / n;
  const uptimePart = Math.max(-1, Math.min(1, (uptime - R.uptimeFloor) / (1 - R.uptimeFloor) * 2 - 1)) * R.uptimeRange;
  const prestigePart = Math.min(R.prestigeMax, prestigeOf(state) * R.prestigePer);
  const loss = CONFIG.difficulty[state.difficulty].reputationLoss;
  return clamp(R.base + uptimePart + prestigePart - (down * R.failedWeight + hot * R.hotWeight) * loss);
}

// Runs every tick; moves reputation once per game hour.
export function stepReputation(state: GameState, uptime: number): void {
  if (!state.liveWorld || state.tick % 60 !== 0 || racksOf(state).length === 0) return;
  const target = reputationTarget(state, uptime);
  state.reputation = clamp(state.reputation + (target - state.reputation) * R.driftPerHour);
}

// 0 at 0, 0.5 at 50, 1 at 100.
const share = (state: GameState): number => (state.liveWorld ? state.reputation / 100 : 0.5);

// Walk-in demand multiplier (1 at 50).
export function reputationDemand(state: GameState): number {
  return R.minDemand + (R.maxDemand - R.minDemand) * share(state);
}

// Contract pay multiplier on new offers (1 at 50).
export function reputationPay(state: GameState): number {
  return 1 + R.payRange * (share(state) * 2 - 1);
}

// More or fewer clients each day.
export function reputationOffers(state: GameState): number {
  if (!state.liveWorld) return 0;
  return state.reputation >= R.extraOfferAt ? 1 : state.reputation < R.fewerOfferAt ? -1 : 0;
}

export function reputationLabel(rep: number): string {
  return rep >= 85 ? 'Excellent' : rep >= 65 ? 'Good' : rep >= 40 ? 'Average' : rep >= 20 ? 'Poor' : 'Terrible';
}
