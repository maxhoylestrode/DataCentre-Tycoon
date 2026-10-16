import { type BuildingCategory, type BuildingKind, buildingDef, CONFIG, type Speed } from '../config';

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
    },
  };
}

export interface GameState {
  width: number;
  height: number;
  buildings: Building[];
  nextBuildingId: number;
  // Temperature of every tile in °C, indexed y * width + x.
  temps: number[];
  cash: number;
  tick: number;
  speed: Speed;
  paused: boolean;
  bankrupt: boolean;
  progress: Progress;
}

export function createInitialState(
  width: number = CONFIG.grid.width,
  height: number = CONFIG.grid.height,
): GameState {
  return {
    width,
    height,
    buildings: [],
    nextBuildingId: 1,
    temps: new Array<number>(width * height).fill(CONFIG.heat.ambient),
    cash: CONFIG.economy.startingCash,
    tick: 0,
    speed: 1,
    paused: false,
    bankrupt: false,
    progress: createProgress(),
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
