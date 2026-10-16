// Versioned save format. Saves store only ids and numbers, never copies of
// content definitions, so new content and rebalanced numbers apply to old
// saves automatically.
//
// To change the format: bump SAVE_VERSION, add a migration from the previous
// version to MIGRATIONS, and update readState. Never edit an old migration.

import { CONFIG, isBuildingKind, type Speed } from '../config';
import { ACHIEVEMENTS } from './content/achievements';
import { GOALS } from './content/goals';
import {
  type Building,
  type BuildingStatus,
  type Contract,
  type ContractResult,
  type ContractsState,
  type ContractTerms,
  createContractsState,
  createInitialState,
  createProgress,
  type GameState,
  type Progress,
  type Stats,
} from './state';

// v1: Milestone 3 game (buildings, cash, time, heat).
// v2: adds progress (XP, goals, achievements, stats).
// v3: adds contracts and the RNG seed.
// v4: adds building upgrade levels.
export const SAVE_VERSION = 4;
const GAME_ID = 'datacentre-tycoon';
const MAX_GRID = 200;

type Data = Record<string, unknown>;

interface SaveEnvelope {
  game: string;
  version: number;
  savedAt: string;
  data: Data;
}

export type LoadResult = { ok: true; state: GameState; savedAt: string } | { ok: false; error: string };

// MIGRATIONS[n] turns version n data into version n + 1 data.
const MIGRATIONS: Record<number, (data: Data) => Data> = {
  // Older games start at level 1 with no goals done. Goals they already
  // satisfy (e.g. "Run 3 racks") complete on the first tick after loading.
  1: (data) => ({ ...data, progress: { xp: 0, completedGoals: [], achievements: [], stats: {} } }),
  // No contracts yet. The seed comes from the game clock so it differs
  // between saves but the same save always migrates the same way.
  2: (data) => ({
    ...data,
    contracts: { offers: [], active: [], history: [], nextId: 1, offersDay: 0 },
    rngSeed: typeof data.tick === 'number' ? data.tick + 1 : 1,
  }),
  // Every existing building starts un-upgraded.
  3: (data) => ({
    ...data,
    buildings: Array.isArray(data.buildings)
      ? data.buildings.map((b: unknown) => (isObject(b) ? { ...b, upgrade: 0 } : b))
      : data.buildings,
  }),
};

export function serialize(state: GameState, now: Date = new Date()): string {
  const envelope: SaveEnvelope = {
    game: GAME_ID,
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    data: {
      width: state.width,
      height: state.height,
      cash: state.cash,
      tick: state.tick,
      speed: state.speed,
      paused: state.paused,
      bankrupt: state.bankrupt,
      nextBuildingId: state.nextBuildingId,
      buildings: state.buildings.map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        builtAtTick: b.builtAtTick,
        status: b.status,
        repairDoneTick: b.repairDoneTick,
        upgrade: b.upgrade,
      })),
      // Rounded to keep saves small; nobody can see the third decimal.
      temps: state.temps.map((t) => Math.round(t * 100) / 100),
      progress: {
        xp: state.progress.xp,
        completedGoals: [...state.progress.completedGoals],
        achievements: [...state.progress.achievements],
        stats: { ...state.progress.stats },
      },
      // Contract terms are the numbers rolled when the offer was made, not
      // copies of customer type definitions.
      contracts: {
        offers: state.contracts.offers.map((o) => ({ ...o })),
        active: state.contracts.active.map((c) => ({ ...c })),
        history: state.contracts.history.map((h) => ({ ...h })),
        nextId: state.contracts.nextId,
        offersDay: state.contracts.offersDay,
      },
      rngSeed: state.rngSeed,
    },
  };
  return JSON.stringify(envelope);
}

export function deserialize(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid save file (not JSON).' };
  }
  if (!isObject(parsed) || parsed.game !== GAME_ID || !isObject(parsed.data)) {
    return { ok: false, error: 'Not a Datacentre Tycoon save file.' };
  }
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Save file has no valid version number.' };
  }
  if (version > SAVE_VERSION) {
    return { ok: false, error: `Save is from a newer version of the game (v${version}, this is v${SAVE_VERSION}).` };
  }

  let data = parsed.data;
  for (let v = version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, error: `No migration from save v${v}.` };
    data = migrate(data);
  }

  return { ok: true, state: readState(data), savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '' };
}

// Builds a fresh state and copies over every saved field that is valid.
// Anything missing or invalid falls back to the new-game default, and
// buildings with unknown ids are dropped.
function readState(data: Data): GameState {
  const width = intIn(data.width, 1, MAX_GRID) ?? CONFIG.grid.width;
  const height = intIn(data.height, 1, MAX_GRID) ?? CONFIG.grid.height;
  const state = createInitialState(width, height);

  state.cash = finite(data.cash) ?? state.cash;
  state.tick = intIn(data.tick, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  state.speed = CONFIG.time.speeds.includes(data.speed as Speed) ? (data.speed as Speed) : 1;
  state.paused = data.paused === true;
  state.bankrupt = data.bankrupt === true;

  const occupied = new Set<string>();
  for (const raw of Array.isArray(data.buildings) ? data.buildings : []) {
    const building = readBuilding(raw, width, height);
    if (!building) continue;
    const key = `${building.x},${building.y}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    state.buildings.push(building);
  }
  const maxId = state.buildings.reduce((m, b) => Math.max(m, b.id), 0);
  state.nextBuildingId = Math.max(maxId + 1, intIn(data.nextBuildingId, 1, Number.MAX_SAFE_INTEGER) ?? 1);

  const temps = data.temps;
  if (Array.isArray(temps) && temps.length === width * height && temps.every((t) => finite(t) !== null)) {
    state.temps = temps.map((t) => Math.max(CONFIG.heat.ambient, t as number));
  }
  state.progress = readProgress(data.progress);
  state.contracts = readContracts(data.contracts);
  state.rngSeed = intIn(data.rngSeed, -(2 ** 31), 2 ** 31 - 1) ?? 1;
  return state;
}

// Offers and contracts carry their own rolled numbers, so they stay valid
// even if their customer type is later removed from content.
function readContracts(raw: unknown): ContractsState {
  const contracts = createContractsState();
  if (!isObject(raw)) return contracts;

  const offers = Array.isArray(raw.offers) ? raw.offers : [];
  contracts.offers = offers.map(readTerms).filter((t): t is ContractTerms => t !== null);

  const active = Array.isArray(raw.active) ? raw.active : [];
  for (const item of active) {
    const terms = readTerms(item);
    if (!terms || !isObject(item)) continue;
    const startTick = finite(item.startTick);
    const endTick = finite(item.endTick);
    if (startTick === null || endTick === null) continue;
    const contract: Contract = {
      ...terms,
      startTick,
      endTick,
      servedRackTicks: Math.max(0, finite(item.servedRackTicks) ?? 0),
      promisedRackTicks: Math.max(0, finite(item.promisedRackTicks) ?? 0),
    };
    contracts.active.push(contract);
  }

  const history = Array.isArray(raw.history) ? raw.history : [];
  for (const item of history) {
    if (!isObject(item) || typeof item.name !== 'string') continue;
    const outcome = item.outcome;
    if (outcome !== 'completed' && outcome !== 'failed' && outcome !== 'cancelled') continue;
    const result: ContractResult = {
      name: item.name,
      outcome,
      uptime: finite(item.uptime) ?? 0,
      cash: finite(item.cash) ?? 0,
      xp: finite(item.xp) ?? 0,
    };
    contracts.history.push(result);
  }

  const maxId = Math.max(0, ...contracts.offers.map((o) => o.id), ...contracts.active.map((c) => c.id));
  contracts.nextId = Math.max(maxId + 1, intIn(raw.nextId, 1, Number.MAX_SAFE_INTEGER) ?? 1);
  contracts.offersDay = intIn(raw.offersDay, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  return contracts;
}

function readTerms(raw: unknown): ContractTerms | null {
  if (!isObject(raw) || typeof raw.name !== 'string' || typeof raw.customerType !== 'string') return null;
  const id = intIn(raw.id, 1, Number.MAX_SAFE_INTEGER);
  const racks = intIn(raw.racks, 1, 10_000);
  const days = intIn(raw.days, 1, 10_000);
  const pay = finite(raw.payPerRackPerTick);
  const sla = finite(raw.sla);
  if (id === null || racks === null || days === null || pay === null || sla === null || sla < 0 || sla > 1) return null;
  return {
    id,
    customerType: raw.customerType,
    name: raw.name,
    racks,
    days,
    payPerRackPerTick: pay,
    sla,
    bonus: Math.max(0, finite(raw.bonus) ?? 0),
    penalty: Math.max(0, finite(raw.penalty) ?? 0),
    xp: Math.max(0, finite(raw.xp) ?? 0),
  };
}

const GOAL_IDS = new Set(GOALS.map((g) => g.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

// Unknown goal and achievement ids (content that was removed) are ignored.
function readProgress(raw: unknown): Progress {
  const progress = createProgress();
  if (!isObject(raw)) return progress;

  progress.xp = Math.max(0, finite(raw.xp) ?? 0);
  progress.completedGoals = uniqueKnown(raw.completedGoals, GOAL_IDS);
  progress.achievements = uniqueKnown(raw.achievements, ACHIEVEMENT_IDS);

  const stats = isObject(raw.stats) ? raw.stats : {};
  for (const key of Object.keys(progress.stats) as (keyof Stats)[]) {
    progress.stats[key] = finite(stats[key]) ?? progress.stats[key];
  }
  return progress;
}

function uniqueKnown(raw: unknown, known: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && known.has(id)))];
}

const STATUSES: BuildingStatus[] = ['ok', 'failed', 'repairing'];

function readBuilding(raw: unknown, width: number, height: number): Building | null {
  if (!isObject(raw) || typeof raw.kind !== 'string' || !isBuildingKind(raw.kind)) return null;
  const id = intIn(raw.id, 1, Number.MAX_SAFE_INTEGER);
  const x = intIn(raw.x, 0, width - 1);
  const y = intIn(raw.y, 0, height - 1);
  if (id === null || x === null || y === null) return null;

  const status = STATUSES.includes(raw.status as BuildingStatus) ? (raw.status as BuildingStatus) : 'ok';
  const repairDoneTick = status === 'repairing' ? (finite(raw.repairDoneTick) ?? 0) : null;
  // Clamped in case the max level is ever lowered.
  const upgrade = Math.min(CONFIG.upgrades.maxLevel, intIn(raw.upgrade, 0, Number.MAX_SAFE_INTEGER) ?? 0);
  return { id, kind: raw.kind, x, y, builtAtTick: finite(raw.builtAtTick) ?? 0, status, repairDoneTick, upgrade };
}

function isObject(v: unknown): v is Data {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
