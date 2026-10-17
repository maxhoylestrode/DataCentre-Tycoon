// Random events, once the 'events' mechanic unlocks. They get more likely as
// the company grows. Each bad one has a building that protects against it:
// - power cut: grid-fed supply drops; UPS battery banks cover the gap.
// - heatwave: the room's ambient temperature rises for a while.
// - fire: a hot rack burns out with its neighbours, unless fire suppression covers it.
// - ddos: an attack eats most of the internet line; firewalls block some of it.
// Good ones: a rush job (cash) and a press visit (cash + XP by prestige).
// Rolled with the seeded RNG, so games stay repeatable.

import { buildingDef, CONFIG } from '../config';
import { prestigeOf } from './prestige';
import { isUnlocked } from './progression';
import { researchBonus } from './research';
import { nextRandom, pick, randomInt } from './rng';
import { type EventKind, type EventRecord, type GameState, isRunning, racksOf, tempAt } from './state';

const E = CONFIG.events;

export const EVENT_NAMES: Record<EventKind, string> = {
  power_cut: 'Power cut',
  heatwave: 'Heatwave',
  fire: 'Fire',
  ddos: 'Cyber attack',
  rush_order: 'Rush job',
  press_visit: 'Press visit',
};

export function activeEffect(state: GameState, kind: EventKind) {
  return state.events.active.find((e) => e.kind === kind && state.tick < e.endTick);
}

export function ambientTemp(state: GameState): number {
  return CONFIG.heat.ambient + (activeEffect(state, 'heatwave') ? E.heatwaveBoost : 0);
}

// Share of the internet line left during an attack (1 when there isn't one).
export function ddosFactor(state: GameState): number {
  if (!activeEffect(state, 'ddos')) return 1;
  const shield = state.buildings.reduce((s, b) => s + (isRunning(b) ? (buildingDef(b.kind).ddosShield ?? 0) : 0), 0);
  return Math.min(1, 1 - E.ddosLoss + shield);
}

// Chance of an event today.
export function eventChancePerDay(state: GameState): number {
  const raw = Math.min(E.maxChancePerDay, E.chancePerDay + racksOf(state).length * E.chancePerRack);
  return raw * (1 - researchBonus(state, 'eventChance'));
}

// Whether a fire at this tile would be put out.
export function isProtectedFromFire(state: GameState, x: number, y: number): boolean {
  return state.buildings.some((b) => {
    const r = buildingDef(b.kind).suppressionRadius;
    return r !== undefined && isRunning(b) && Math.abs(b.x - x) <= r && Math.abs(b.y - y) <= r;
  });
}

function record(state: GameState, kind: EventKind, text: string, good: boolean): EventRecord {
  const rec = { kind, tick: state.tick, text, good };
  state.events.history.push(rec);
  if (state.events.history.length > E.historyLength) state.events.history.splice(0, state.events.history.length - E.historyLength);
  return rec;
}

function startTimed(state: GameState, kind: EventKind, [min, max]: readonly number[]): number {
  const ticks = randomInt(state, min!, max!);
  state.events.active.push({ kind, startTick: state.tick, endTick: state.tick + ticks });
  return ticks;
}

const hours = (ticks: number): string => {
  const h = Math.round(ticks / 60);
  return h <= 1 ? 'about an hour' : `${h} hours`;
};

// Makes one event happen now (also used by tests). Returns what happened, or
// null if nothing could (e.g. a fire with no racks).
export function triggerEvent(state: GameState, kind: EventKind, incomePerTick = 0): EventRecord | null {
  if (activeEffect(state, kind)) return null;
  switch (kind) {
    case 'power_cut': {
      const t = startTimed(state, kind, E.powerCutTicks);
      return record(state, kind, `The grid is down for ${hours(t)}. UPS batteries cover what they can.`, false);
    }
    case 'heatwave': {
      const t = startTimed(state, kind, E.heatwaveTicks);
      return record(state, kind, `Heatwave: +${E.heatwaveBoost}°C for ${hours(t)}. Watch your cooling.`, false);
    }
    case 'ddos': {
      const t = startTimed(state, kind, E.ddosTicks);
      return record(state, kind, `Cyber attack on your network for ${hours(t)}. Firewalls block part of it.`, false);
    }
    case 'fire': {
      // The hottest running rack is most at risk.
      const racks = racksOf(state).filter(isRunning).sort((a, b) => tempAt(state, b.x, b.y) - tempAt(state, a.x, a.y));
      const origin = racks.slice(0, 5).length ? pick(state, racks.slice(0, 5)) : undefined;
      if (!origin) return null;
      if (isProtectedFromFire(state, origin.x, origin.y)) {
        return record(state, kind, 'A fire started in a rack, but the fire suppression put it out.', true);
      }
      const near = racks
        .filter((r) => r !== origin && Math.abs(r.x - origin.x) <= 1 && Math.abs(r.y - origin.y) <= 1)
        .slice(0, E.fireSpread);
      for (const r of [origin, ...near]) {
        r.status = 'failed';
        state.progress.stats.failures += 1;
      }
      return record(state, kind, `Fire! ${1 + near.length} rack${near.length ? 's' : ''} burned out. Fire suppression would have stopped it.`, false);
    }
    case 'rush_order': {
      const pay = Math.round(Math.max(500, incomePerTick * E.rushOrderMinutes));
      state.cash += pay;
      return record(state, kind, `A client paid £${pay.toLocaleString('en-GB')} for a rush job.`, true);
    }
    case 'press_visit': {
      const prestige = prestigeOf(state);
      const pay = Math.round(prestige * E.pressCashPerPrestige);
      state.cash += pay;
      state.progress.xp += E.pressXp;
      return record(state, kind, `A tech magazine toured your datacentre: +£${pay.toLocaleString('en-GB')} and +${E.pressXp} XP. Decor helps.`, true);
    }
  }
}

// Runs every tick. Ends events whose time is up and, once an hour, maybe
// starts a new one. Returns a newly started event, if any.
export function stepEvents(state: GameState, incomePerTick: number): EventRecord | null {
  state.events.active = state.events.active.filter((e) => state.tick < e.endTick);
  if (!isUnlocked(state, 'events') || state.tick % 60 !== 0 || state.tick === 0) return null;
  const hourly = eventChancePerDay(state) / 24;
  if (nextRandom(state) >= hourly) return null;
  const weights = Object.entries(E.weights) as [EventKind, number][];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = nextRandom(state) * total;
  for (const [kind, w] of weights) {
    roll -= w;
    if (roll <= 0) return triggerEvent(state, kind, incomePerTick);
  }
  return null;
}

// What's going on right now, for the HUD.
export function activeEventText(state: GameState): string[] {
  return state.events.active
    .filter((e) => state.tick < e.endTick)
    .map((e) => `${EVENT_NAMES[e.kind]}: ${Math.ceil((e.endTick - state.tick) / 60)}h left`);
}
