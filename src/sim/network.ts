// Network bandwidth: one internet line for the company; running racks share it.

import { rackBandwidth } from './buildings';
import { UPLINKS } from './content/uplinks';
import type { Uplink } from './content/types';
import { demandFactor, peakDemandFactor } from './daynight';
import { ddosFactor } from './events';
import { researchBonus } from './research';
import { categoryOf, type GameState, isRunning } from './state';

export function uplinkOf(state: GameState): Uplink {
  return UPLINKS.find((u) => u.id === state.uplink) ?? UPLINKS[0]!;
}

// The next faster line, or null at the top.
export function nextUplink(state: GameState): Uplink | null {
  return UPLINKS[UPLINKS.indexOf(uplinkOf(state)) + 1] ?? null;
}

// Mbps all running racks want (less with peering research).
export function bandwidthDemand(state: GameState): number {
  const raw = state.buildings.reduce(
    (sum, b) => sum + (categoryOf(b) === 'rack' && isRunning(b) ? rackBandwidth(b) : 0),
    0,
  );
  // Traffic follows the time of day (live world): the evening peak is the test.
  return raw * (1 - researchBonus(state, 'bandwidthSaving')) * demandFactor(state);
}

// Mbps racks will want at the evening peak (the same as now without a live world).
export function peakBandwidthDemand(state: GameState): number {
  return (bandwidthDemand(state) / demandFactor(state)) * peakDemandFactor(state);
}

// Mbps the line delivers right now (less during a cyber attack).
export function lineCapacity(state: GameState): number {
  return uplinkOf(state).mbps * ddosFactor(state);
}

// 1 while the line keeps up; supply / demand when it doesn't.
export function networkEfficiency(state: GameState): number {
  const demand = bandwidthDemand(state);
  if (demand <= 0) return 1;
  return Math.min(1, lineCapacity(state) / demand);
}

// "740 Mbps", "12.5 Gbps".
export function formatMbps(mbps: number): string {
  if (mbps >= 1000) return `${Number((mbps / 1000).toFixed(mbps >= 100_000 ? 0 : 1))} Gbps`;
  return `${Math.round(mbps)} Mbps`;
}
