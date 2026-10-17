// Network bandwidth: one internet line for the company; running racks share it.

import { rackBandwidth } from './buildings';
import { UPLINKS } from './content/uplinks';
import type { Uplink } from './content/types';
import { categoryOf, type GameState, isRunning } from './state';

export function uplinkOf(state: GameState): Uplink {
  return UPLINKS.find((u) => u.id === state.uplink) ?? UPLINKS[0]!;
}

// The next faster line, or null at the top.
export function nextUplink(state: GameState): Uplink | null {
  return UPLINKS[UPLINKS.indexOf(uplinkOf(state)) + 1] ?? null;
}

// Mbps all running racks want.
export function bandwidthDemand(state: GameState): number {
  return state.buildings.reduce(
    (sum, b) => sum + (categoryOf(b) === 'rack' && isRunning(b) ? rackBandwidth(b) : 0),
    0,
  );
}

// 1 while the line keeps up; supply / demand when it doesn't.
export function networkEfficiency(state: GameState): number {
  const demand = bandwidthDemand(state);
  if (demand <= 0) return 1;
  return Math.min(1, uplinkOf(state).mbps / demand);
}

// "740 Mbps", "12.5 Gbps".
export function formatMbps(mbps: number): string {
  if (mbps >= 1000) return `${Number((mbps / 1000).toFixed(mbps >= 100_000 ? 0 : 1))} Gbps`;
  return `${Math.round(mbps)} Mbps`;
}
