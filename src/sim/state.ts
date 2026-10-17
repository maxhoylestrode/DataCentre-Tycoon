import {
  type BuildingCategory,
  type BuildingKind,
  buildingDef,
  CONFIG,
  type Difficulty,
  type FloorKind,
  type PartSlot,
  type Speed,
  type StaffRole,
  type WallKind,
  type ZoneKind,
} from '../config';
import { STARTING_LOT } from './content/lots';
import { UPLINKS } from './content/uplinks';
import type { ContractRequirement } from './content/types';
import { MAP_HEIGHT, MAP_WIDTH } from './lots';

// 'building': waiting for (or being built by) an engineer; not running yet.
// Only racks use 'failed' and 'repairing'.
export type BuildingStatus = 'building' | 'ok' | 'failed' | 'repairing';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  builtAtTick: number;
  status: BuildingStatus;
  // Tick at which a repairing rack comes back online.
  repairDoneTick: number | null;
  // Upgrade level, 0 (as built) to CONFIG.upgrades.maxLevel. Racks stay at 0
  // and upgrade through parts instead.
  upgrade: number;
  // Racks only: installed part id per slot. A missing slot means the stock part.
  parts: Partial<Record<PartSlot, string>>;
  // Facing, in quarter turns (0-3). Visual only.
  rot: number;
  // Racks: when the CPU was last replaced or refurbished (hardware ageing).
  refreshedAtTick: number;
  // Racks: when a technician last serviced it (maintenance).
  lastServicedTick: number;
  // Engineer work left before it's built (status 'building'), in ticks.
  buildRemaining: number;
}

// 'desk': an account manager staffing a reception desk (sim/sales.ts).
export type StaffTaskKind = 'build' | 'repair' | 'service' | 'desk';

export interface StaffTask {
  kind: StaffTaskKind;
  buildingId: number;
  // Work left once on site, in ticks. At a desk: time left talking to a client.
  workLeft: number;
  // At a desk: the offer whose client they're talking to.
  offerId?: number;
}

// Staff traits and specialisms (sim/staff.ts has what each does).
export type StaffTrait = 'speedy' | 'tinkerer' | 'careful' | 'night_owl' | 'early_bird' | 'workaholic' | 'lazy' | 'charmer';
export type Specialism = 'electrician' | 'repair_specialist' | 'senior_tech' | 'negotiator';

export interface StaffMember {
  id: number;
  role: StaffRole;
  // The starting engineer: free, can't be fired.
  founder: boolean;
  // Position in tile units (tile centres are x + 0.5).
  x: number;
  y: number;
  // Remaining waypoints (tile coordinates) to walk through.
  path: [number, number][];
  task: StaffTask | null;
  name: string;
  // 1 to 5; rises with jobs done and training.
  level: number;
  jobs: number;
  trait: StaffTrait | null;
  specialism: Specialism | null;
  // Away training until this tick (null when not training).
  trainingUntil: number | null;
}

// Someone you could hire today (sim/staff.ts).
export interface Candidate {
  id: number;
  role: StaffRole;
  name: string;
  level: number;
  trait: StaffTrait | null;
}

export interface Client {
  id: number;
  // The offer this client is bringing.
  offerId: number;
  x: number;
  y: number;
  path: [number, number][];
  state: 'entering' | 'waiting' | 'leaving';
  // Tick this client walks in (they arrive one after another).
  spawnTick: number;
}

// A painted zone tile (see sim/zones.ts).
export interface ZoneTile {
  kind: ZoneKind;
  x: number;
  y: number;
}

// Something painted on the floor layer; it can sit under a building.
export interface FloorTile {
  kind: FloorKind;
  x: number;
  y: number;
}

// A wall along one edge between two tiles.
// 'h': the horizontal grid line on top of tile (x, y), between (x, y-1) and (x, y).
// 'v': the vertical grid line left of tile (x, y), between (x-1, y) and (x, y).
export interface WallSegment {
  kind: WallKind;
  x: number;
  y: number;
  dir: 'h' | 'v';
}

export interface StyleState {
  // Active room style id per slot (content/styles.ts).
  floor: string;
  wall: string;
  lighting: string;
  // Every style bought, including the free defaults.
  owned: string[];
}

export function createStyleState(): StyleState {
  return {
    floor: 'floor_standard',
    wall: 'wall_grey',
    lighting: 'light_standard',
    owned: ['floor_standard', 'wall_grey', 'light_standard'],
  };
}

// Running totals used by goals, achievements and XP rules.
export interface Stats {
  totalEarned: number;
  built: number;
  repairs: number;
  failures: number;
  // Build XP cap bookkeeping: which game day, and XP given for building that day.
  buildXpDay: number;
  buildXpToday: number;
  // Net profit so far today, and the best full day so far.
  dayProfit: number;
  bestDayProfit: number;
  contractsSigned: number;
  contractsCompleted: number;
  contractsFailed: number;
  // Completed with 100% uptime.
  perfectContracts: number;
  contractIncome: number;
  upgrades: number;
  staffHired: number;
  services: number;
  refurbishes: number;
  clientsServed: number;
  // Contracts account managers signed.
  staffSigned: number;
  // Corporation tax paid in total, so far today, and for the whole of yesterday.
  taxPaid: number;
  taxToday: number;
  lastTax: number;
  overheadPaid: number;
  ransomsPaid: number;
}

// What a customer is offering. Rolled once when the offer is made, then
// stored as plain numbers so later content changes don't alter a deal.
export interface ContractTerms {
  id: number;
  // Id from content/customers.ts; only used for display.
  customerType: string;
  name: string;
  racks: number;
  days: number;
  payPerRackPerTick: number;
  // Promised uptime, 0..1.
  sla: number;
  bonus: number;
  penalty: number;
  xp: number;
  // Copied from the customer type when offered. Missing means any rack will do.
  requirement?: ContractRequirement;
  // Offers only: whether the client has reached reception (can be signed).
  arrived?: boolean;
  // Offers only: an account manager's verdict after talking to the client.
  review?: { recommend: boolean; note: string };
  // Signed by an account manager rather than the player.
  signedByStaff?: boolean;
}

export interface Contract extends ContractTerms {
  startTick: number;
  endTick: number;
  // Rack-minutes actually served, and rack-minutes promised so far.
  servedRackTicks: number;
  promisedRackTicks: number;
}

export interface ContractResult {
  name: string;
  outcome: 'completed' | 'failed' | 'cancelled';
  uptime: number;
  // Bonus paid (positive) or penalty charged (negative).
  cash: number;
  xp: number;
}

export interface ContractsState {
  offers: ContractTerms[];
  active: Contract[];
  // Most recent last.
  history: ContractResult[];
  nextId: number;
  // Day the current offers were made; 0 means never.
  offersDay: number;
  // Whether account managers sign contracts they recommend, or only advise.
  autoSign: boolean;
}

export function createContractsState(): ContractsState {
  return { offers: [], active: [], history: [], nextId: 1, offersDay: 0, autoSign: true };
}

export interface Progress {
  // Total XP ever earned. Level is derived from this, never stored.
  xp: number;
  // Ids from content/goals.ts and content/achievements.ts.
  completedGoals: string[];
  achievements: string[];
  stats: Stats;
}

export function createProgress(): Progress {
  return {
    xp: 0,
    completedGoals: [],
    achievements: [],
    stats: {
      totalEarned: 0,
      built: 0,
      repairs: 0,
      failures: 0,
      buildXpDay: 0,
      buildXpToday: 0,
      dayProfit: 0,
      bestDayProfit: 0,
      contractsSigned: 0,
      contractsCompleted: 0,
      contractsFailed: 0,
      perfectContracts: 0,
      contractIncome: 0,
      upgrades: 0,
      staffHired: 0,
      services: 0,
      refurbishes: 0,
      clientsServed: 0,
      staffSigned: 0,
      taxPaid: 0,
      taxToday: 0,
      lastTax: 0,
      overheadPaid: 0,
      ransomsPaid: 0,
    },
  };
}

export interface ResearchState {
  // Finished project ids (content/research.ts).
  done: string[];
  // The running project and game ticks of work left.
  current: { id: string; remaining: number } | null;
}

export type EventKind =
  | 'power_cut' | 'heatwave' | 'fire' | 'ddos' | 'rush_order' | 'press_visit'
  // Late game (live world, from pressure.lateFromLevel).
  | 'blackout' | 'ransomware' | 'big_fire';

export interface ActiveEvent {
  kind: EventKind;
  startTick: number;
  endTick: number;
}

export interface EventRecord {
  kind: EventKind;
  tick: number;
  // What happened, for the toast and the stats page.
  text: string;
  // Good news or bad.
  good: boolean;
}

export interface EventsState {
  active: ActiveEvent[];
  // Most recent last.
  history: EventRecord[];
}

// Carried over when the company is sold (sim/legacy.ts).
export interface LegacyState {
  points: number;
  sales: number;
}

// Every value the stats graphs track (sim/history.ts says how each is measured).
// Money is per tick; uptime and efficiencies are 0..1; temperatures in °C.
export const HISTORY_FIELDS = [
  // Averaged over the hour.
  'income', 'walkIn', 'contracts', 'costs', 'rent', 'upkeep', 'electricity', 'network', 'wages', 'overhead', 'tax',
  'uptime', 'powerEff', 'networkEff', 'powerDraw', 'powerSupply', 'bandwidth', 'lineCapacity', 'avgTemp', 'maxTemp',
  'demand', 'electricityRate', 'batteryCharge',
  // Taken at the end of the hour.
  'cash', 'racks', 'racksRunning', 'racksFailed', 'racksContracted', 'buildings', 'staff', 'engineers',
  'technicians', 'activeContracts', 'clientsWaiting', 'prestige', 'level', 'xp', 'researchDone', 'market', 'reputation',
] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

// One stats sample per game hour. Fields can be missing in samples from
// older saves, which tracked fewer things; graphs leave a gap there.
export type HistorySample = { tick: number } & Partial<Record<HistoryField, number>>;

export interface HistoryState {
  samples: HistorySample[];
  // Running sums for the hour being sampled.
  acc: { ticks: number; sums: Partial<Record<HistoryField, number>> };
}

export function createHistoryState(): HistoryState {
  return { samples: [], acc: { ticks: 0, sums: {} } };
}

export interface GameState {
  width: number;
  height: number;
  buildings: Building[];
  nextBuildingId: number;
  floor: FloorTile[];
  walls: WallSegment[];
  style: StyleState;
  // Lot ids (content/lots.ts) the player owns. Only owned tiles can be built on.
  ownedLots: string[];
  // Temperature of every tile in °C, indexed y * width + x.
  temps: number[];
  cash: number;
  tick: number;
  speed: Speed;
  paused: boolean;
  bankrupt: boolean;
  progress: Progress;
  contracts: ContractsState;
  // Seeded RNG state (see rng.ts).
  rngSeed: number;
  // Internet line id (content/uplinks.ts).
  uplink: string;
  zones: ZoneTile[];
  staff: StaffMember[];
  nextStaffId: number;
  clients: Client[];
  nextClientId: number;
  // Whether people are simulated: engineers build and repair, technicians
  // service racks, clients walk in. On in real games; engine tests leave it
  // off so they can test other systems on their own.
  staffSim: boolean;
  // Tick cash first went below the overdraft limit (null when it isn't).
  overdrawnSince: number | null;
  research: ResearchState;
  events: EventsState;
  legacy: LegacyState;
  history: HistoryState;
  // The live world: day and night, reputation, overhead, tax, hardware end of
  // life and late-game threats. On in real games; engine tests leave it off
  // so the systems they test stay predictable.
  liveWorld: boolean;
  difficulty: Difficulty;
  // 0–100; 50 is neutral (sim/reputation.ts).
  reputation: number;
  // UPS batteries' shared charge, 0–1, and what they do with it (sim/daynight.ts).
  battery: { charge: number; mode: BatteryMode };
  // Today's hiring candidates and the day they were picked (sim/staff.ts).
  candidates: Candidate[];
  candidatesDay: number;
  nextCandidateId: number;
}

// 'save': charge at night, discharge at the evening peak to cut the bill.
// 'reserve': stay full for power cuts.
export type BatteryMode = 'save' | 'reserve';

export interface NewGameOptions {
  // See GameState.staffSim.
  staffSim?: boolean;
  // See GameState.liveWorld.
  liveWorld?: boolean;
  difficulty?: Difficulty;
  // Legacy carried over from a sold company.
  legacy?: LegacyState;
}

// The seed defaults to 1 so tests are repeatable; the game passes a random one.
// Defaults to the full map; tests pass small grids, which act as one room.
export function createInitialState(
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
  seed = 1,
  options: NewGameOptions = {},
): GameState {
  const staffSim = options.staffSim ?? false;
  const legacy = options.legacy ? { ...options.legacy } : { points: 0, sales: 0 };
  return {
    width,
    height,
    buildings: [],
    nextBuildingId: 1,
    floor: [],
    walls: [],
    style: createStyleState(),
    ownedLots: [STARTING_LOT],
    temps: new Array<number>(width * height).fill(CONFIG.heat.ambient),
    cash: CONFIG.economy.startingCash + legacy.points * CONFIG.legacy.startingCashPerPoint,
    tick: 0,
    speed: 1,
    paused: false,
    bankrupt: false,
    progress: createProgress(),
    contracts: createContractsState(),
    rngSeed: seed | 0,
    uplink: UPLINKS[0]!.id,
    zones: [],
    // Every game starts with the founder: a free engineer in the first room.
    staff: staffSim ? [createFounder()] : [],
    nextStaffId: 2,
    clients: [],
    nextClientId: 1,
    staffSim,
    overdrawnSince: null,
    research: { done: [], current: null },
    events: { active: [], history: [] },
    legacy,
    history: createHistoryState(),
    liveWorld: options.liveWorld ?? false,
    difficulty: options.difficulty ?? 'normal',
    reputation: CONFIG.reputation.start,
    battery: { charge: 1, mode: 'save' },
    candidates: [],
    candidatesDay: 0,
    nextCandidateId: 1,
  };
}

export function createFounder(): StaffMember {
  return {
    id: 1, role: 'engineer', founder: true, x: 1, y: 1, path: [], task: null,
    name: 'You', level: 1, jobs: 0, trait: null, specialism: null, trainingUntil: null,
  };
}

// 1-based game day.
export function dayOf(state: GameState): number {
  return Math.floor(state.tick / CONFIG.time.ticksPerDay) + 1;
}

export function isInBounds(state: GameState, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function getBuildingAt(state: GameState, x: number, y: number): Building | undefined {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

export function categoryOf(building: Building): BuildingCategory {
  return buildingDef(building.kind).category;
}

export function zoneAt(state: GameState, x: number, y: number): ZoneTile | undefined {
  return state.zones.find((z) => z.x === x && z.y === y);
}

export function floorAt(state: GameState, x: number, y: number): FloorTile | undefined {
  return state.floor.find((f) => f.x === x && f.y === y);
}

export function racksOf(state: GameState): Building[] {
  return state.buildings.filter((b) => categoryOf(b) === 'rack');
}

// A rack that is switched on: drawing power, making heat and (if powered) earning.
export function isRunning(building: Building): boolean {
  return building.status === 'ok';
}

export function tempAt(state: GameState, x: number, y: number): number {
  return state.temps[y * state.width + x] ?? CONFIG.heat.ambient;
}
