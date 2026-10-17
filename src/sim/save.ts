// Versioned save format. Saves store only ids and numbers, never copies of
// content definitions, so new content and rebalanced numbers apply to old
// saves automatically.
//
// To change the format: bump SAVE_VERSION, add a migration from the previous
// version to MIGRATIONS, and update readState. Never edit an old migration.

import {
  buildingDef,
  CONFIG,
  isBuildingKind,
  isFloorKind,
  isWallKind,
  type Speed,
  type StaffRole,
  ZONE_KINDS,
  type ZoneKind,
} from '../config';
import { isValidWallEdge } from './walls';
import { UPLINKS } from './content/uplinks';
import { LOTS, STARTING_LOT } from './content/lots';
import { MAP_HEIGHT, MAP_WIDTH } from './lots';
import { ACHIEVEMENTS } from './content/achievements';
import { GOALS } from './content/goals';
import { PARTS } from './content/parts';
import { RESEARCH } from './content/research';
import type { ContractRequirement } from './content/types';
import { ROOM_STYLES } from './content/styles';
import {
  type Building,
  type BuildingStatus,
  type Client,
  type StaffMember,
  type StaffTaskKind,
  type ZoneTile,
  type Contract,
  type ContractResult,
  type ContractsState,
  type ContractTerms,
  createContractsState,
  createInitialState,
  createProgress,
  createHistoryState,
  createStyleState,
  type EventKind,
  type EventsState,
  type FloorTile,
  type GameState,
  HISTORY_FIELDS,
  type HistoryField,
  type HistoryState,
  type LegacyState,
  type ResearchState,
  type Progress,
  type Stats,
  type StyleState,
  type WallSegment,
} from './state';

// v1: Milestone 3 game (buildings, cash, time, heat).
// v2: adds progress (XP, goals, achievements, stats).
// v3: adds contracts and the RNG seed.
// v4: adds building upgrade levels.
// v5: racks upgrade through parts instead of levels; adds the floor layer and room style.
// v6: adds interior walls.
// v7: adds rooms (owned lots); the map grows to fit every lot.
// v8: staff, clients, zones, internet line, building rotation, ageing, maintenance and construction.
// v9: research, random events, legacy (company sales) and stats history.
export const SAVE_VERSION = 9;

// Part ids as they were when v5 was introduced. Hard-coded so this migration
// never changes if the parts catalogue does later.
const V5_PART_PATHS = {
  cpu: ['cpu_xeon_e5_2620v4', 'cpu_epyc_7302', 'cpu_xeon_gold_6338', 'cpu_epyc_7543', 'cpu_epyc_7763'],
  ram: ['ram_32gb_ddr4', 'ram_64gb_ddr4', 'ram_128gb_ddr4', 'ram_256gb_ddr4'],
  storage: ['sto_hdd_2x1tb', 'sto_hdd_4x2tb', 'sto_ssd_pm883', 'sto_nvme_pm9a3'],
  network: ['net_1g_i350', 'net_10g_x710', 'net_25g_cx4'],
};

// A v4 rack upgrade level becomes roughly equivalent parts: CPU first, then
// memory and storage, then network.
function partsForOldRackLevel(level: number): Record<string, string> {
  const pick = (path: string[], tier: number): string => path[Math.min(path.length - 1, Math.max(0, tier))]!;
  return {
    cpu: pick(V5_PART_PATHS.cpu, Math.ceil(level * 0.4)),
    ram: pick(V5_PART_PATHS.ram, Math.floor(level * 0.3)),
    storage: pick(V5_PART_PATHS.storage, Math.floor(level * 0.3)),
    network: pick(V5_PART_PATHS.network, Math.floor(level * 0.25)),
  };
}
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
    contracts: { offers: [], active: [], history: [], nextId: 1, offersDay: 0, autoSign: true },
    rngSeed: typeof data.tick === 'number' ? data.tick + 1 : 1,
  }),
  // Every existing building starts un-upgraded.
  3: (data) => ({
    ...data,
    buildings: Array.isArray(data.buildings)
      ? data.buildings.map((b: unknown) => (isObject(b) ? { ...b, upgrade: 0 } : b))
      : data.buildings,
  }),
  4: (data) => ({
    ...data,
    buildings: Array.isArray(data.buildings)
      ? data.buildings.map((b: unknown) => {
          if (!isObject(b) || b.kind !== 'rack_basic') return b;
          const level = typeof b.upgrade === 'number' ? b.upgrade : 0;
          return { ...b, upgrade: 0, parts: partsForOldRackLevel(level) };
        })
      : data.buildings,
    floor: [],
    style: null,
  }),
  5: (data) => ({ ...data, walls: [] }),
  6: (data) => ({ ...data, ownedLots: ['lot_0_0'] }),
  // Real games (at least one room in size) switch on the people simulation
  // and get their founder engineer. Hardware and maintenance clocks start
  // fresh so nothing is suddenly old or overdue.
  7: (data) => {
    const real = typeof data.width === 'number' && data.width >= CONFIG.lots.width;
    const tick = typeof data.tick === 'number' ? data.tick : 0;
    return {
      ...data,
      staffSim: real,
      staff: real ? [{ id: 1, role: 'engineer', founder: true, x: 1, y: 1 }] : [],
      nextStaffId: 2,
      buildings: Array.isArray(data.buildings)
        ? data.buildings.map((b: unknown) => (isObject(b) ? { ...b, refreshedAtTick: tick, lastServicedTick: tick } : b))
        : data.buildings,
    };
  },
  // Nothing researched, no events yet, no legacy, empty history.
  8: (data) => ({ ...data, research: null, events: null, legacy: null, history: null }),
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
        parts: { ...b.parts },
        rot: b.rot,
        refreshedAtTick: b.refreshedAtTick,
        lastServicedTick: b.lastServicedTick,
        buildRemaining: b.buildRemaining,
      })),
      uplink: state.uplink,
      zones: state.zones.map((z) => ({ kind: z.kind, x: z.x, y: z.y })),
      staffSim: state.staffSim,
      // Staff and clients are saved with where they stand; their routes are
      // recalculated after loading.
      staff: state.staff.map((s) => ({
        id: s.id, role: s.role, founder: s.founder, x: s.x, y: s.y, task: s.task ? { ...s.task } : null,
      })),
      nextStaffId: state.nextStaffId,
      clients: state.clients.map((c) => ({ id: c.id, offerId: c.offerId, x: c.x, y: c.y, state: c.state, spawnTick: c.spawnTick })),
      nextClientId: state.nextClientId,
      floor: state.floor.map((f) => ({ kind: f.kind, x: f.x, y: f.y })),
      walls: state.walls.map((w) => ({ kind: w.kind, x: w.x, y: w.y, dir: w.dir })),
      ownedLots: [...state.ownedLots],
      style: { ...state.style, owned: [...state.style.owned] },
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
        autoSign: state.contracts.autoSign,
      },
      rngSeed: state.rngSeed,
      research: { done: [...state.research.done], current: state.research.current ? { ...state.research.current } : null },
      events: { active: state.events.active.map((e) => ({ ...e })), history: state.events.history.map((e) => ({ ...e })) },
      legacy: { ...state.legacy },
      overdrawnSince: state.overdrawnSince,
      history: {
        // Rounded: the graphs don't need more.
        samples: state.history.samples.map((s) => {
          const out: Record<string, number> = { tick: s.tick };
          for (const f of HISTORY_FIELDS) {
            const v = s[f];
            if (v !== undefined) out[f] = Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 1000) / 1000;
          }
          return out;
        }),
        acc: { ticks: state.history.acc.ticks, sums: { ...state.history.acc.sums } },
      },
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
  const savedWidth = intIn(data.width, 1, MAX_GRID) ?? MAP_WIDTH;
  const savedHeight = intIn(data.height, 1, MAX_GRID) ?? MAP_HEIGHT;
  // A real game (at least one room in size) loads onto the current map, so
  // adding rooms to content grows old maps. Lots only extend right and
  // forward, so existing coordinates stay put. Smaller test grids are kept.
  const isGameMap = savedWidth >= CONFIG.lots.width && savedHeight >= CONFIG.lots.height;
  const width = isGameMap ? Math.max(savedWidth, MAP_WIDTH) : savedWidth;
  const height = isGameMap ? Math.max(savedHeight, MAP_HEIGHT) : savedHeight;
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

  // Copy saved temperatures tile by tile, in case the map grew.
  const temps = data.temps;
  if (Array.isArray(temps) && temps.length === savedWidth * savedHeight && temps.every((t) => finite(t) !== null)) {
    for (let y = 0; y < savedHeight; y++) {
      for (let x = 0; x < savedWidth; x++) {
        state.temps[y * width + x] = Math.max(CONFIG.heat.ambient, temps[y * savedWidth + x] as number);
      }
    }
  }
  state.ownedLots = readOwnedLots(data.ownedLots);
  state.staffSim = data.staffSim === true;
  state.uplink = typeof data.uplink === 'string' && UPLINKS.some((u) => u.id === data.uplink) ? data.uplink : UPLINKS[0]!.id;
  state.zones = readZones(data.zones, state);
  state.staff = readStaff(data.staff, state);
  // A people-simulated game always has its founder.
  if (state.staffSim && !state.staff.some((s) => s.founder)) {
    state.staff.unshift({ id: 0, role: 'engineer', founder: true, x: 1, y: 1, path: [], task: null });
  }
  state.nextStaffId = Math.max(
    state.staff.reduce((m, s) => Math.max(m, s.id), 0) + 1,
    intIn(data.nextStaffId, 1, Number.MAX_SAFE_INTEGER) ?? 1,
  );
  state.floor = readFloor(data.floor, width, height);
  state.walls = readWalls(data.walls, state);
  state.style = readStyle(data.style);
  state.progress = readProgress(data.progress);
  state.contracts = readContracts(data.contracts);
  state.rngSeed = intIn(data.rngSeed, -(2 ** 31), 2 ** 31 - 1) ?? 1;
  state.clients = readClients(data.clients, state);
  state.nextClientId = Math.max(
    state.clients.reduce((m, c) => Math.max(m, c.id), 0) + 1,
    intIn(data.nextClientId, 1, Number.MAX_SAFE_INTEGER) ?? 1,
  );
  // Tasks on buildings that no longer exist are dropped.
  const ids = new Set(state.buildings.map((b) => b.id));
  for (const s of state.staff) if (s.task && !ids.has(s.task.buildingId)) s.task = null;
  state.research = readResearch(data.research);
  state.events = readEvents(data.events);
  state.legacy = readLegacy(data.legacy);
  state.overdrawnSince = intIn(data.overdrawnSince, 0, Number.MAX_SAFE_INTEGER);
  state.history = readHistory(data.history);
  return state;
}

const RESEARCH_IDS = new Set(RESEARCH.map((r) => r.id));
const EVENT_KINDS: EventKind[] = ['power_cut', 'heatwave', 'fire', 'ddos', 'rush_order', 'press_visit'];

function readResearch(raw: unknown): ResearchState {
  if (!isObject(raw)) return { done: [], current: null };
  const done = uniqueKnown(raw.done, RESEARCH_IDS);
  const c = isObject(raw.current) ? raw.current : null;
  const current =
    c && typeof c.id === 'string' && RESEARCH_IDS.has(c.id) && !done.includes(c.id)
      ? { id: c.id, remaining: Math.max(1, finite(c.remaining) ?? 1) }
      : null;
  return { done, current };
}

function readEvents(raw: unknown): EventsState {
  const events: EventsState = { active: [], history: [] };
  if (!isObject(raw)) return events;
  for (const e of Array.isArray(raw.active) ? raw.active : []) {
    if (!isObject(e) || !EVENT_KINDS.includes(e.kind as EventKind)) continue;
    const startTick = finite(e.startTick);
    const endTick = finite(e.endTick);
    if (startTick === null || endTick === null) continue;
    events.active.push({ kind: e.kind as EventKind, startTick, endTick });
  }
  for (const e of Array.isArray(raw.history) ? raw.history : []) {
    if (!isObject(e) || !EVENT_KINDS.includes(e.kind as EventKind) || typeof e.text !== 'string') continue;
    events.history.push({ kind: e.kind as EventKind, tick: finite(e.tick) ?? 0, text: e.text, good: e.good === true });
  }
  events.history = events.history.slice(-CONFIG.events.historyLength);
  return events;
}

function readLegacy(raw: unknown): LegacyState {
  if (!isObject(raw)) return { points: 0, sales: 0 };
  return { points: intIn(raw.points, 0, 1_000_000) ?? 0, sales: intIn(raw.sales, 0, 1_000_000) ?? 0 };
}

// Known stats fields that are finite numbers; anything else is dropped.
function readHistoryFields(raw: Record<string, unknown>): Partial<Record<HistoryField, number>> {
  const out: Partial<Record<HistoryField, number>> = {};
  for (const f of HISTORY_FIELDS) {
    const v = finite(raw[f]);
    if (v !== null) out[f] = f === 'uptime' ? clamp(v, 0, 1) : v;
  }
  return out;
}

function readHistory(raw: unknown): HistoryState {
  const history = createHistoryState();
  if (!isObject(raw)) return history;
  for (const s of Array.isArray(raw.samples) ? raw.samples : []) {
    if (!isObject(s)) continue;
    const tick = finite(s.tick);
    if (tick === null) continue;
    history.samples.push({ tick, ...readHistoryFields(s) });
  }
  history.samples = history.samples.slice(-CONFIG.history.maxSamples);
  if (isObject(raw.acc)) {
    const a = raw.acc;
    // Early v9 saves kept the running sums at the top level, not under sums.
    const sums = readHistoryFields(isObject(a.sums) ? a.sums : a);
    const ticks = intIn(a.ticks, 0, CONFIG.history.sampleTicks) ?? 0;
    // An hour sampled with the old, shorter list would average the new
    // fields over too few ticks: start that hour afresh instead.
    history.acc = isObject(a.sums) ? { ticks, sums } : { ticks: 0, sums: {} };
  }
  return history;
}

function readZones(raw: unknown, state: GameState): ZoneTile[] {
  const zones: ZoneTile[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isObject(item) || !ZONE_KINDS.includes(item.kind as ZoneKind)) continue;
    const x = intIn(item.x, 0, state.width - 1);
    const y = intIn(item.y, 0, state.height - 1);
    if (x === null || y === null || seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    zones.push({ kind: item.kind as ZoneKind, x, y });
  }
  return zones;
}

const TASK_KINDS: StaffTaskKind[] = ['build', 'repair', 'service', 'desk'];

function readStaff(raw: unknown, state: GameState): StaffMember[] {
  const staff: StaffMember[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isObject(item) || typeof item.role !== 'string' || !Object.hasOwn(CONFIG.staff.roles, item.role)) continue;
    const id = intIn(item.id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) continue;
    const t = isObject(item.task) ? item.task : null;
    const task =
      t && TASK_KINDS.includes(t.kind as StaffTaskKind) && intIn(t.buildingId, 1, Number.MAX_SAFE_INTEGER) !== null
        ? { kind: t.kind as StaffTaskKind, buildingId: t.buildingId as number, workLeft: Math.max(0, finite(t.workLeft) ?? 0) }
        : null;
    staff.push({
      id,
      role: item.role as StaffRole,
      founder: item.founder === true,
      x: clamp(finite(item.x) ?? 1, 0, state.width - 1),
      y: clamp(finite(item.y) ?? 1, 0, state.height - 1),
      path: [],
      task,
    });
  }
  return staff;
}

function readClients(raw: unknown, state: GameState): Client[] {
  const offers = new Set(state.contracts.offers.map((o) => o.id));
  const clients: Client[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isObject(item)) continue;
    const id = intIn(item.id, 1, Number.MAX_SAFE_INTEGER);
    const offerId = intIn(item.offerId, 1, Number.MAX_SAFE_INTEGER);
    const st = item.state;
    if (id === null || offerId === null || (st !== 'entering' && st !== 'waiting' && st !== 'leaving')) continue;
    // A client whose offer is gone just leaves.
    const clientState = offers.has(offerId) || st === 'leaving' ? st : 'leaving';
    clients.push({
      id, offerId, x: finite(item.x) ?? 0, y: finite(item.y) ?? 0, path: [],
      state: clientState, spawnTick: finite(item.spawnTick) ?? 0,
    });
  }
  return clients;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
  contracts.autoSign = raw.autoSign !== false;
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
    ...readRequirement(raw.requirement),
    ...(raw.arrived === true ? { arrived: true } : {}),
    ...(isObject(raw.review) && typeof raw.review.note === 'string'
      ? { review: { recommend: raw.review.recommend === true, note: raw.review.note.slice(0, 200) } }
      : {}),
    ...(raw.signedByStaff === true ? { signedByStaff: true } : {}),
  };
}

// Only known, valid requirement fields are kept.
function readRequirement(raw: unknown): { requirement?: ContractRequirement } {
  if (!isObject(raw)) return {};
  const req: ContractRequirement = {};
  const tier = intIn(raw.minRackTier, 1, 100);
  const cores = finite(raw.minCores);
  if (tier !== null) req.minRackTier = tier;
  if (cores !== null && cores > 0) req.minCores = cores;
  if (raw.gpu === true) req.gpu = true;
  return Object.keys(req).length ? { requirement: req } : {};
}

// Unknown floor kinds, off-grid tiles and duplicates are dropped.
function readFloor(raw: unknown, width: number, height: number): FloorTile[] {
  const tiles: FloorTile[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isObject(item) || typeof item.kind !== 'string' || !isFloorKind(item.kind)) continue;
    const x = intIn(item.x, 0, width - 1);
    const y = intIn(item.y, 0, height - 1);
    if (x === null || y === null || seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    tiles.push({ kind: item.kind, x, y });
  }
  return tiles;
}

// Unknown lot ids are dropped; the starting room is always owned.
function readOwnedLots(raw: unknown): string[] {
  const known = new Set(LOTS.map((l) => l.id));
  return [...new Set([STARTING_LOT, ...uniqueKnown(raw, known)])];
}

// Unknown wall kinds, edges outside the room and duplicates are dropped.
function readWalls(raw: unknown, state: GameState): WallSegment[] {
  const walls: WallSegment[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isObject(item) || typeof item.kind !== 'string' || !isWallKind(item.kind)) continue;
    const dir = item.dir;
    if (dir !== 'h' && dir !== 'v') continue;
    const x = finite(item.x);
    const y = finite(item.y);
    if (x === null || y === null || !isValidWallEdge(state, item.kind, x, y, dir)) continue;
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) continue;
    seen.add(key);
    walls.push({ kind: item.kind, x, y, dir });
  }
  return walls;
}

// Unknown style ids are dropped; an active style that isn't valid or owned
// falls back to the default for its slot.
function readStyle(raw: unknown): StyleState {
  const style = createStyleState();
  if (!isObject(raw)) return style;
  const known = new Set(ROOM_STYLES.map((s) => s.id));
  style.owned = [...new Set([...style.owned, ...uniqueKnown(raw.owned, known)])];
  for (const slot of ['floor', 'wall', 'lighting'] as const) {
    const id = raw[slot];
    const def = ROOM_STYLES.find((s) => s.id === id);
    if (typeof id === 'string' && def?.slot === slot && style.owned.includes(id)) style[slot] = id;
  }
  return style;
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

const STATUSES: BuildingStatus[] = ['building', 'ok', 'failed', 'repairing'];

function readBuilding(raw: unknown, width: number, height: number): Building | null {
  if (!isObject(raw) || typeof raw.kind !== 'string' || !isBuildingKind(raw.kind)) return null;
  const id = intIn(raw.id, 1, Number.MAX_SAFE_INTEGER);
  const x = intIn(raw.x, 0, width - 1);
  const y = intIn(raw.y, 0, height - 1);
  if (id === null || x === null || y === null) return null;

  const status = STATUSES.includes(raw.status as BuildingStatus) ? (raw.status as BuildingStatus) : 'ok';
  const repairDoneTick = status === 'repairing' ? (finite(raw.repairDoneTick) ?? 0) : null;
  // Clamped in case the max level is ever lowered. Racks upgrade through parts.
  const slots = buildingDef(raw.kind).slots ?? [];
  const level = Math.min(CONFIG.upgrades.maxLevel, intIn(raw.upgrade, 0, Number.MAX_SAFE_INTEGER) ?? 0);
  const upgrade = slots.length > 0 ? 0 : level;

  // Keep only known parts that belong in a slot this rack has.
  const parts: Building['parts'] = {};
  if (isObject(raw.parts)) {
    for (const slot of slots) {
      const part = PARTS.find((p) => p.id === (raw.parts as Data)[slot]);
      if (part && part.slot === slot) parts[slot] = part.id;
    }
  }
  const builtAtTick = finite(raw.builtAtTick) ?? 0;
  return {
    id, kind: raw.kind, x, y, builtAtTick, status, repairDoneTick, upgrade, parts,
    rot: intIn(raw.rot, 0, 3) ?? 0,
    refreshedAtTick: finite(raw.refreshedAtTick) ?? builtAtTick,
    lastServicedTick: finite(raw.lastServicedTick) ?? builtAtTick,
    buildRemaining: status === 'building' ? Math.max(0, finite(raw.buildRemaining) ?? 0) : 0,
  };
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
