// Day and night. In a live world:
// - walk-in customers (and the bandwidth they use) follow a daily curve that
//   averages 1, so the day's income is unchanged but the evening peak strains
//   your internet line;
// - electricity is cheap at night and dear at the evening peak;
// - UPS batteries can charge at night and cover the peak ('save' mode), or
//   stay full for power cuts ('reserve'); a power cut drains them;
// - the room is a little warmer in the afternoon and cooler at night.
// Without a live world every factor here is 1 (or 0 for temperature).

import { CONFIG } from '../config';
import type { GameState } from './state';

const D = CONFIG.dayNight;
const MEAN = D.demand.reduce((a, b) => a + b, 0) / D.demand.length;

// Hour of the day, 0 to just under 24 (fractional).
export function hourOf(tick: number): number {
  return (tick % CONFIG.time.ticksPerDay) / 60;
}

// Walk-in demand right now, interpolated between hours, averaging 1 over a day.
export function demandFactor(state: GameState): number {
  if (!state.liveWorld) return 1;
  const h = hourOf(state.tick);
  const i = Math.floor(h);
  const a = D.demand[i]!;
  const b = D.demand[(i + 1) % 24]!;
  return (a + (b - a) * (h - i)) / MEAN;
}

// The busiest moment's demand over today's average (1 without a live world).
export function peakDemandFactor(state: GameState): number {
  return state.liveWorld ? Math.max(...D.demand) / MEAN : 1;
}

const inHours =(h: number, [from, to]: readonly number[]): boolean => h >= from! && h < to!;

export type RateBand = 'night' | 'peak' | 'normal';

export function rateBand(state: GameState): RateBand {
  if (!state.liveWorld) return 'normal';
  const h = hourOf(state.tick);
  if (inHours(h, D.nightHours)) return 'night';
  if (inHours(h, D.peakHours)) return 'peak';
  return 'normal';
}

// Electricity price multiplier right now.
export function electricityRate(state: GameState): number {
  const band = rateBand(state);
  return band === 'night' ? D.nightRate : band === 'peak' ? D.peakRate : 1;
}

// Ambient temperature change from the time of day (°C).
export function dayTempOffset(state: GameState): number {
  if (!state.liveWorld) return 0;
  return D.tempSwing * Math.cos((2 * Math.PI * (hourOf(state.tick) - D.tempPeakHour)) / 24);
}

// Batteries: kWh they can hold, given their total backup kW.
export function batteryCapacityKwh(backupKw: number): number {
  return backupKw * D.batteryHours;
}

export interface BatteryFlow {
  // kW the batteries add to your draw (charging) or take off it (discharging).
  chargeKw: number;
  dischargeKw: number;
}

// What the batteries do this tick (not counting power cuts, see power.ts).
export function batteryFlow(state: GameState, backupKw: number, drawKw: number): BatteryFlow {
  const none = { chargeKw: 0, dischargeKw: 0 };
  if (!state.liveWorld || backupKw <= 0) return none;
  const capacity = batteryCapacityKwh(backupKw);
  const band = rateBand(state);
  if (band === 'night' && state.battery.charge < 1) {
    const kw = Math.min(capacity * D.batteryChargePerHour, (1 - state.battery.charge) * capacity * 60);
    return { chargeKw: kw, dischargeKw: 0 };
  }
  if (band === 'peak' && state.battery.mode === 'save' && state.battery.charge > 0) {
    const kw = Math.min(backupKw, drawKw, state.battery.charge * capacity * 60);
    return { chargeKw: 0, dischargeKw: kw };
  }
  return none;
}

// Applies a tick of battery use: kW drawn in (positive) or out (negative).
export function moveBatteryCharge(state: GameState, backupKw: number, netKw: number): void {
  const capacity = batteryCapacityKwh(backupKw);
  if (capacity <= 0) return;
  state.battery.charge = Math.max(0, Math.min(1, state.battery.charge + netKw / 60 / capacity));
}
