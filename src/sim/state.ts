import {
  type BuildingCategory,
  type BuildingKind,
  buildingDef,
  CONFIG,
  type FloorKind,
  type PartSlot,
  type Speed,
  type WallKind,
} from '../config';

// Only racks use 'failed' and 'repairing'; other buildings stay 'ok'.
export type BuildingStatus = 'ok' | 'failed' | 'repairing';

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
}

export function createContractsState(): ContractsState {
  return { offers: [], active: [], history: [], nextId: 1, offersDay: 0 };
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
    },
  };
}

export interface GameState {
  width: number;
  height: number;
  buildings: Building[];
  nextBuildingId: number;
  floor: FloorTile[];
  walls: WallSegment[];
  style: StyleState;
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
}

// The seed defaults to 1 so tests are repeatable; the game passes a random one.
export function createInitialState(
  width: number = CONFIG.grid.width,
  height: number = CONFIG.grid.height,
  seed = 1,
): GameState {
  return {
    width,
    height,
    buildings: [],
    nextBuildingId: 1,
    floor: [],
    walls: [],
    style: createStyleState(),
    temps: new Array<number>(width * height).fill(CONFIG.heat.ambient),
    cash: CONFIG.economy.startingCash,
    tick: 0,
    speed: 1,
    paused: false,
    bankrupt: false,
    progress: createProgress(),
    contracts: createContractsState(),
    rngSeed: seed | 0,
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
