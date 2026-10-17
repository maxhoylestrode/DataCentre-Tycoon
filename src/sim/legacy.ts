// Selling the company: once you're big enough you can sell up and start
// again. The sale earns legacy points from the company's value, and each
// point gives permanent extra income and starting cash in every later game.

import { CONFIG } from '../config';
import { investedValue } from './buildings';
import { netIncomePerTick } from './economy';
import { levelOf } from './progression';
import { createInitialState, type GameState } from './state';

// Cash, plus what the buildings would sell for, plus ten days of profit.
export function companyValue(state: GameState): number {
  const assets = state.buildings.reduce((s, b) => s + investedValue(b) * CONFIG.economy.sellRefund, 0);
  const goodwill = Math.max(0, netIncomePerTick(state)) * CONFIG.time.ticksPerDay * 10;
  return Math.max(0, state.cash + assets + goodwill);
}

export function legacyPointsFor(state: GameState): number {
  return Math.floor(CONFIG.legacy.perSqrtMillion * Math.sqrt(companyValue(state) / 1_000_000));
}

export function canSellCompany(state: GameState): boolean {
  return !state.bankrupt && levelOf(state) >= CONFIG.legacy.minLevel && legacyPointsFor(state) > 0;
}

// A brand new game carrying the legacy forward. The caller swaps it in.
export function sellCompany(state: GameState, seed: number): GameState | null {
  if (!canSellCompany(state)) return null;
  return createInitialState(state.width, state.height, seed, {
    staffSim: state.staffSim,
    legacy: { points: state.legacy.points + legacyPointsFor(state), sales: state.legacy.sales + 1 },
  });
}
