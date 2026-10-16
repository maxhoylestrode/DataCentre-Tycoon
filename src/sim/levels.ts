// The XP curve. Kept separate from progression.ts so conditions can use it
// without a circular import.

import { CONFIG } from '../config';

const P = CONFIG.progression;

// XP needed to go from `level` to `level + 1`.
export function xpToNext(level: number): number {
  return Math.round(P.xpBase * level ** P.xpExponent);
}

export interface LevelInfo {
  level: number;
  // XP earned since reaching this level, and XP this level needs in total.
  xpIntoLevel: number;
  xpForNext: number;
}

// Works for any amount of XP: there is no max level.
export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpToNext(level) };
}

// Total XP needed to reach `level` from zero.
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}
