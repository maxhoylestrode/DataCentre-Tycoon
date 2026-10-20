// Random events, once the 'events' mechanic unlocks. They get more likely as
// the company grows. Each bad one has a building that protects against it:
// - power cut: grid-fed supply drops; UPS battery banks cover the gap.
// - heatwave: the room's ambient temperature rises for a while.
// - fire: a hot rack burns out with its neighbours, unless fire suppression covers it.
// - ddos: an attack eats most of the internet line; firewalls filter it, each
//   up to half the attack, more with upgrades (sim/safety.ts).
// Good ones: a rush job (cash) and a press visit (cash + XP by prestige).
// Rolled with the seeded RNG, so games stay repeatable.

import { buildingDef, CONFIG } from '../config';
import { UPLINKS } from './content/uplinks';
import { dayTempOffset } from './daynight';
import { prestigeOf } from './prestige';
import { isUnlocked, levelOf } from './progression';
import { adjustReputation } from './reputation';
import { researchBonus } from './research';
import { nextRandom, pick, randomInt } from './rng';
import { attackBlocked } from './safety';
import { type EventKind, type EventRecord, type GameState, isRunning, racksOf, tempAt } from './state';

const E = CONFIG.events;

export const EVENT_NAMES: Record<EventKind, string> = {
  power_cut: 'Power cut',
  heatwave: 'Heatwave',
  fire: 'Fire',
  ddos: 'Cyber attack',
  rush_order: 'Rush job',
  press_visit: 'Press visit',
  blackout: 'Blackout',
  ransomware: 'Ransomware',
  big_fire: 'Major fire',
};

// Whether ransomware has contract systems locked.
export function contractsLocked(state: GameState): boolean {
  return activeEffect(state, 'ransomware') !== undefined;
}

// Late-game incidents happen in a live world from pressure.lateFromLevel.
export function lateIncidents(state: GameState): boolean {
  return state.liveWorld && levelOf(state) >= CONFIG.pressure.lateFromLevel;
}

// The ransom to end a ransomware attack now (null when there isn't one).
export function ransomCost(state: GameState, incomePerTick: number): number | null {
  if (!activeEffect(state, 'ransomware')) return null;
  return Math.round(Math.max(2000, incomePerTick * CONFIG.lateEvents.ransomMinutes) / 50) * 50;
}

export function activeEffect(state: GameState, kind: EventKind) {
  return state.events.active.find((e) => e.kind === kind && state.tick < e.endTick);
}

export function ambientTemp(state: GameState): number {
  return CONFIG.heat.ambient + (activeEffect(state, 'heatwave') ? E.heatwaveBoost : 0) + dayTempOffset(state);
}

// Size of a cyber attack in Mbps: a share of your line, so attacks grow with it.
export function attackMbps(state: GameState): number {
  const line = UPLINKS.find((u) => u.id === state.uplink) ?? UPLINKS[0]!;
  return line.mbps * E.ddosLoss;
}

// Share of an attack your firewalls block right now (0 to 1).
export function ddosBlocked(state: GameState): number {
  return attackBlocked(state, attackMbps(state));
}

// Share of the internet line left during an attack (1 when there isn't one).
export function ddosFactor(state: GameState): number {
  if (!activeEffect(state, 'ddos')) return 1;
  return 1 - E.ddosLoss * (1 - ddosBlocked(state));
}

// Chance of an event today.
export function eventChancePerDay(state: GameState): number {
  const raw = Math.min(E.maxChancePerDay, E.chancePerDay + racksOf(state).length * E.chancePerRack);
  const difficulty = state.liveWorld ? CONFIG.difficulty[state.difficulty].incidents : 1;
  return Math.min(1, raw * difficulty) * (1 - researchBonus(state, 'eventChance'));
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
    case 'fire':
    case 'big_fire': {
      // The hottest running rack is most at risk.
      const racks = racksOf(state).filter(isRunning).sort((a, b) => tempAt(state, b.x, b.y) - tempAt(state, a.x, a.y));
      const origin = racks.slice(0, 5).length ? pick(state, racks.slice(0, 5)) : undefined;
      if (!origin) return null;
      if (isProtectedFromFire(state, origin.x, origin.y)) {
        state.progress.stats.firesStopped += 1;
        return record(state, kind, 'A fire started in a rack, but the fire suppression put it out.', true);
      }
      // A normal fire takes a couple of neighbours; a major one everything
      // nearby that suppression doesn't cover.
      const big = kind === 'big_fire';
      const reach = big ? CONFIG.lateEvents.bigFireRadius : 1;
      const near = racks
        .filter((r) => r !== origin && Math.abs(r.x - origin.x) <= reach && Math.abs(r.y - origin.y) <= reach)
        .filter((r) => !big || !isProtectedFromFire(state, r.x, r.y))
        .slice(0, big ? Infinity : E.fireSpread);
      for (const r of [origin, ...near]) {
        r.status = 'failed';
        state.progress.stats.failures += 1;
      }
      state.progress.stats.fires += 1;
      adjustReputation(state, CONFIG.reputation.fire * (big ? 2 : 1));
      const n = 1 + near.length;
      return record(state, kind, `${big ? 'Major fire' : 'Fire'}! ${n} rack${n > 1 ? 's' : ''} burned out. Fire suppression would have stopped it.`, false);
    }
    case 'blackout': {
      const t = startTimed(state, kind, CONFIG.lateEvents.blackoutTicks);
      return record(state, kind, `Blackout: the grid is almost completely down for ${hours(t)}. Batteries and on-site generators are all you have.`, false);
    }
    case 'ransomware': {
      if (ddosBlocked(state) >= CONFIG.lateEvents.ransomwareShield) {
        state.progress.stats.attacksStopped += 1;
        return record(state, kind, 'Your firewalls stopped a ransomware attack.', true);
      }
      const t = startTimed(state, kind, CONFIG.lateEvents.ransomwareTicks);
      return record(state, kind, `Ransomware! Contract systems are locked for ${hours(t)}: contracts aren't being served. Pay the ransom (Contracts panel) or wait it out.`, false);
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

// Runs every tick with this tick's income and efficiency (1 = nothing lost to
// brownouts or a full line). Ends events whose time is up and, once an hour,
// maybe starts a new one. Returns a newly started event, if any.
export function stepEvents(state: GameState, incomePerTick: number, efficiency = 1): EventRecord | null {
  for (const e of state.events.active) {
    if (e.kind !== 'blackout') continue;
    if (state.tick < e.endTick && efficiency < 0.999) e.hit = true;
    // A blackout that ends without ever causing a brownout was weathered.
    if (state.tick >= e.endTick && !e.hit) state.progress.stats.blackoutsWeathered += 1;
  }
  state.events.active = state.events.active.filter((e) => state.tick < e.endTick);
  if (!isUnlocked(state, 'events') || state.tick % 60 !== 0 || state.tick === 0) return null;
  const hourly = eventChancePerDay(state) / 24;
  if (nextRandom(state) >= hourly) return null;
  const weights = [
    ...Object.entries(E.weights),
    ...(lateIncidents(state) ? Object.entries(CONFIG.lateEvents.weights) : []),
  ] as [EventKind, number][];
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
