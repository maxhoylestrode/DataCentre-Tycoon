// Staff as people: names, levels, traits, specialisms, daily hiring
// candidates and training. Movement and jobs are in people.ts.
//
// Levels rise with jobs done (CONFIG.staffGrowth.levelJobs) or training. Each
// level past 1 makes someone faster but raises their wage. Traits and
// specialisms change what they're good at; see TRAITS and SPECIALISMS.
//
// Names and candidates come from a hash of the game seed, day and slot rather
// than the game's RNG, so hiring doesn't change which contracts or incidents
// you get.

import { buildingDef, CONFIG, type StaffRole } from '../config';
import { hourOf } from './daynight';
import { isUnlocked, levelOf } from './progression';
import {
  type Building,
  type Candidate,
  dayOf,
  type GameState,
  type Specialism,
  type StaffMember,
  type StaffTrait,
} from './state';

const G = CONFIG.staffGrowth;

export interface TraitInfo {
  name: string;
  text: string;
  // Roles it can turn up on (all when missing).
  roles?: StaffRole[];
}

export const TRAITS: Record<StaffTrait, TraitInfo> = {
  speedy: { name: 'Speedy', text: 'Walks 25% faster.' },
  tinkerer: { name: 'Tinkerer', text: 'Builds and repairs 30% faster.', roles: ['engineer'] },
  careful: { name: 'Careful', text: 'Services last 30% longer.', roles: ['technician', 'engineer'] },
  night_owl: { name: 'Night owl', text: '30% faster at night (20:00–06:00), 10% slower by day.' },
  early_bird: { name: 'Early bird', text: '30% faster by day (06:00–18:00), 10% slower at night.' },
  workaholic: { name: 'Workaholic', text: 'Never slowed down by full staff rooms.' },
  lazy: { name: 'Lazy', text: '25% cheaper wage, but 15% slower.' },
  charmer: { name: 'Charmer', text: 'Contracts they sign pay 4% more.', roles: ['account_manager'] },
};

export interface SpecialismInfo {
  name: string;
  text: string;
  role: StaffRole;
}

export const SPECIALISMS: Record<Specialism, SpecialismInfo> = {
  electrician: { name: 'Electrician', text: 'Builds power, cooling and safety twice as fast.', role: 'engineer' },
  repair_specialist: { name: 'Repair specialist', text: 'Repairs twice as fast.', role: 'engineer' },
  senior_tech: { name: 'Senior tech', text: 'Services last 50% longer.', role: 'technician' },
  negotiator: { name: 'Negotiator', text: 'Contracts they sign pay 6% more.', role: 'account_manager' },
};

const FIRST = [
  'Alex', 'Sam', 'Priya', 'Tom', 'Aisha', 'Ben', 'Chloe', 'Dan', 'Ella', 'Femi', 'Grace', 'Harry', 'Imogen', 'Jack',
  'Kofi', 'Leah', 'Mo', 'Nina', 'Oli', 'Rosa', 'Ravi', 'Sophie', 'Theo', 'Uma', 'Will', 'Yusuf', 'Zara', 'Jamie',
  'Kai', 'Lily', 'Max', 'Noor', 'Owen', 'Ruby', 'Sian', 'Toby', 'Wren', 'Ayo', 'Freya', 'Hamza',
];
const LAST = [
  'Patel', 'Smith', 'Jones', 'Okafor', 'Khan', 'Taylor', 'Brown', 'Evans', 'Wilson', 'Davies', 'Ali', 'Nguyen',
  'Clarke', 'Murphy', 'Hughes', 'Walsh', 'Singh', 'Mensah', 'Cooper', 'Reid', 'Bennett', 'Shah', 'Kowalski', 'Price',
];

// A repeatable number in [0, 1) from any list of integers.
function hash01(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

const pickBy = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length]!;

export function nameFor(...seed: number[]): string {
  return `${pickBy(FIRST, hash01(...seed, 1))} ${pickBy(LAST, hash01(...seed, 2))}`;
}

function traitsFor(role: StaffRole): StaffTrait[] {
  return (Object.keys(TRAITS) as StaffTrait[]).filter((t) => !TRAITS[t].roles || TRAITS[t].roles!.includes(role));
}

// A trait (or none, a third of the time) for this seed.
export function traitFor(role: StaffRole, ...seed: number[]): StaffTrait | null {
  if (hash01(...seed, 3) < 1 / 3) return null;
  return pickBy(traitsFor(role), hash01(...seed, 4));
}

// --- Numbers -----------------------------------------------------------------

export function levelFromJobs(jobs: number): number {
  let level = 1;
  G.levelJobs.forEach((need, i) => {
    if (jobs >= need) level = i + 1;
  });
  return level;
}

export function wageOf(member: Pick<StaffMember, 'role' | 'level' | 'trait' | 'founder'>): number {
  if (member.founder) return 0;
  const base = CONFIG.staff.roles[member.role].wagePerTick;
  return base * (1 + G.wagePerLevel * (member.level - 1)) * (member.trait === 'lazy' ? 0.75 : 1);
}

export function hireFeeOf(c: Pick<Candidate, 'role' | 'level'>): number {
  return Math.round((CONFIG.staff.roles[c.role].hireFee * (1 + G.feePerLevel * (c.level - 1))) / 50) * 50;
}

export function trainingCost(member: StaffMember): number {
  return Math.round((CONFIG.staff.roles[member.role].hireFee * member.level * G.trainingCost) / 50) * 50;
}

const isNight = (hour: number): boolean => hour >= 20 || hour < 6;

// How fast someone works and walks (1 = a level 1 hire with no trait).
export function workSpeedOf(state: GameState, member: StaffMember): number {
  let speed = 1 + G.speedPerLevel * (member.level - 1);
  const night = isNight(hourOf(state.tick));
  if (member.trait === 'night_owl') speed *= night ? 1.3 : 0.9;
  if (member.trait === 'early_bird') speed *= night ? 0.9 : 1.3;
  if (member.trait === 'lazy') speed *= 0.85;
  return speed;
}

export function walkSpeedOf(state: GameState, member: StaffMember): number {
  return workSpeedOf(state, member) * (member.trait === 'speedy' ? 1.25 : 1);
}

// Extra speed on a particular job.
export function jobSpeedOf(member: StaffMember, kind: 'build' | 'repair' | 'service', b: Building): number {
  let speed = 1;
  if (member.trait === 'tinkerer' && (kind === 'build' || kind === 'repair')) speed *= 1.3;
  if (member.specialism === 'repair_specialist' && kind === 'repair') speed *= 2;
  if (member.specialism === 'electrician' && kind === 'build') {
    const cat = buildingDef(b.kind).category;
    if (cat === 'power' || cat === 'cooling' || cat === 'chiller' || cat === 'safety') speed *= 2;
  }
  return speed;
}

// How much longer a service by this person lasts (1 = normal).
export function serviceLengthOf(member: StaffMember): number {
  return (member.trait === 'careful' ? 1.3 : 1) * (member.specialism === 'senior_tech' ? 1.5 : 1);
}

// Extra pay on contracts this account manager signs.
export function signingBonusOf(member: StaffMember): number {
  return (member.trait === 'charmer' ? 0.04 : 0) + (member.specialism === 'negotiator' ? 0.06 : 0);
}

export const isAway = (member: StaffMember): boolean => member.trainingUntil !== null;

// --- Changes -----------------------------------------------------------------

// A finished job: counts towards the next level.
export function recordJob(member: StaffMember): void {
  member.jobs += 1;
  member.level = Math.max(member.level, levelFromJobs(member.jobs));
}

// Roles you can hire right now.
export function hirableRoles(state: GameState): StaffRole[] {
  if (!isUnlocked(state, 'staff')) return [];
  return (Object.keys(CONFIG.staff.roles) as StaffRole[]).filter((r) => levelOf(state) >= CONFIG.staff.roles[r].minLevel);
}

// New candidates every morning: a few per role, mostly level 1–2, sometimes
// more experienced (more often as your company grows).
export function refreshCandidates(state: GameState): void {
  if (!state.staffSim) return;
  const day = dayOf(state);
  if (state.candidatesDay === day) return;
  state.candidatesDay = day;
  state.candidates = [];
  const seniority = Math.min(1, levelOf(state) / 30);
  for (const role of hirableRoles(state)) {
    const ri = Object.keys(CONFIG.staff.roles).indexOf(role);
    for (let i = 0; i < G.candidatesPerRole; i++) {
      const seed = [state.rngSeed, day, ri, i];
      const roll = hash01(...seed, 5);
      const level = roll < 0.55 - seniority * 0.25 ? 1 : roll < 0.85 - seniority * 0.15 ? 2 : roll < 0.97 ? 3 : 4;
      state.candidates.push({ id: state.nextCandidateId++, role, name: nameFor(...seed), level, trait: traitFor(role, ...seed) });
    }
  }
}

// A new staff member, standing at (x, y).
export function newMember(state: GameState, c: Omit<Candidate, 'id'>, x: number, y: number): StaffMember {
  return {
    id: state.nextStaffId++, role: c.role, founder: false, x, y, path: [], task: null,
    name: c.name, level: c.level, jobs: G.levelJobs[c.level - 1] ?? 0, trait: c.trait, specialism: null, trainingUntil: null,
  };
}

// Specialisms this person could train for now.
export function specialismsFor(member: StaffMember): Specialism[] {
  if (member.specialism || member.level < G.specialismLevel) return [];
  return (Object.keys(SPECIALISMS) as Specialism[]).filter((s) => SPECIALISMS[s].role === member.role);
}

// Brings back anyone whose training has finished.
export function stepTraining(state: GameState): void {
  for (const m of state.staff) {
    if (m.trainingUntil === null || state.tick < m.trainingUntil) continue;
    m.trainingUntil = null;
  }
}
