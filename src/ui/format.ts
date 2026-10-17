// Shared number formatting for the UI. Sim values are floats (upgrades
// multiply by 1.15 etc.), so never print them raw: 48.4999999 should read 48.5.

import { CONFIG } from '../config';

// Rounds to at most `decimals` places and drops trailing zeros: 48.5, 20, 6.4.
export function num(n: number, decimals = 1): string {
  return String(Number(n.toFixed(decimals)));
}

export function kw(n: number): string {
  return `${num(n)} kW`;
}

// "Day 3 · 14:05" for a tick.
export function clockText(tick: number): string {
  const { ticksPerDay } = CONFIG.time;
  const day = Math.floor(tick / ticksPerDay) + 1;
  const minute = tick % ticksPerDay;
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `Day ${day} &middot; ${hh}:${mm}`;
}
