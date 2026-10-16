// XP, levels, unlocks, goals and achievements. Engine only: all content
// (what unlocks when, which goals exist) lives in sim/content/.

import { CONFIG } from '../config';
import { isMet } from './conditions';
import { ACHIEVEMENTS } from './content/achievements';
import { GOALS } from './content/goals';
import { TIERS } from './content/tiers';
import type { Goal, Reward, Tier, Unlock } from './content/types';
import { UNLOCKS } from './content/unlocks';
import { levelInfo } from './levels';
import { dayOf, type GameState } from './state';

export { levelInfo, type LevelInfo, totalXpForLevel, xpToNext } from './levels';

const P = CONFIG.progression;

// Mechanics that exist in code and can be gated by an unlock.
export const MECHANICS = ['heat_map', 'contract_board'] as const;

export function levelOf(state: GameState): number {
  return levelInfo(state.progress.xp).level;
}

export function tierFor(level: number): Tier {
  let tier = TIERS[0]!;
  for (const t of TIERS) if (level >= t.minLevel) tier = t;
  return tier;
}

export function unlockFor(id: string): Unlock | undefined {
  return UNLOCKS.find((u) => u.id === id);
}

// Anything without an unlock entry stays locked (the validation test makes
// sure every building and mechanic has one).
export function isUnlocked(state: GameState, id: string): boolean {
  const unlock = unlockFor(id);
  return unlock !== undefined && levelOf(state) >= unlock.level;
}

// Unlocks gained by going from `fromLevel` to `toLevel`.
export function unlocksBetween(fromLevel: number, toLevel: number): Unlock[] {
  return UNLOCKS.filter((u) => u.level > fromLevel && u.level <= toLevel);
}

export function activeGoals(state: GameState): Goal[] {
  const done = new Set(state.progress.completedGoals);
  return GOALS.filter((g) => !done.has(g.id) && (g.after ?? []).every((id) => done.has(id))).slice(
    0,
    P.maxActiveGoals,
  );
}

function grant(state: GameState, reward: Reward): void {
  state.progress.xp += reward.xp;
  state.cash += reward.cash ?? 0;
}

// Small XP for building, capped per game day.
export function awardBuildXp(state: GameState): void {
  const stats = state.progress.stats;
  const day = dayOf(state);
  if (stats.buildXpDay !== day) {
    stats.buildXpDay = day;
    stats.buildXpToday = 0;
  }
  const xp = Math.min(P.buildXp, P.buildXpDailyCap - stats.buildXpToday);
  if (xp <= 0) return;
  stats.buildXpToday += xp;
  state.progress.xp += xp;
}

// Called once per tick with that tick's income and net profit.
export function recordTick(state: GameState, income: number, net: number): void {
  const stats = state.progress.stats;
  stats.totalEarned += income;
  stats.dayProfit += net;
}

// Called when a game day ends. A new best day earns XP.
export function endDay(state: GameState): void {
  const stats = state.progress.stats;
  if (stats.dayProfit > 0 && stats.dayProfit > stats.bestDayProfit) {
    stats.bestDayProfit = stats.dayProfit;
    state.progress.xp += P.profitRecordXp;
  }
  stats.dayProfit = 0;
}

// Completes every goal and achievement whose condition is met and pays
// their rewards. Loops because completing a goal can reveal one that is
// already met.
export function checkProgress(state: GameState): void {
  if (state.bankrupt) return;
  const progress = state.progress;

  for (let pass = 0; pass < GOALS.length + 1; pass++) {
    const met = activeGoals(state).filter((g) => isMet(state, g.condition));
    if (met.length === 0) break;
    for (const goal of met) {
      progress.completedGoals.push(goal.id);
      grant(state, goal.reward);
    }
  }

  for (const achievement of ACHIEVEMENTS) {
    if (progress.achievements.includes(achievement.id) || !isMet(state, achievement.condition)) continue;
    progress.achievements.push(achievement.id);
    grant(state, achievement.reward);
  }
}
