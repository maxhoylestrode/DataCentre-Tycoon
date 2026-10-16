// All tunable numbers live here. Pure data: no Three.js or DOM imports,
// because the sim reads this file too.

export const CONFIG = {
  grid: {
    width: 20,
    height: 14,
  },
  time: {
    // 1 tick = 1 game minute.
    ticksPerDay: 1440,
    // Sim ticks per real second at 1x speed. A game day lasts 144s at 1x.
    ticksPerSecondAt1x: 10,
    speeds: [1, 2, 4],
    // Safety cap so a long frame (e.g. a background tab) can't freeze the page.
    maxTicksPerFrame: 100,
  },
  economy: {
    startingCash: 5000,
    // Fraction of a building's cost returned when it is sold.
    sellRefund: 0.5,
    // A new rack fills with customers linearly over this many ticks.
    rackRampTicks: 1440,
    // Fixed room cost per tick. Must stay well below one full rack's profit,
    // or a single rack can never pay its way.
    rentPerTick: 0.25,
    // Cash may go this far below zero before bankruptcy. Purchases still need
    // enough positive cash.
    overdraftLimit: 500,
    // Repairing a failed rack costs this fraction of the rack's price...
    repairCostFraction: 0.25,
    // ...and keeps it offline for this many ticks (3 game hours).
    repairTicks: 180,
  },
  // Every buildable thing, keyed by a stable id that saves and unlocks refer
  // to. Never rename an id once released; add a new one instead.
  // category decides behaviour: racks earn, power units supply, cooling cools.
  // incomePerTick: earned once a rack is fully occupied and fully powered.
  // upkeepPerTick: charged from the moment it is built.
  // heatPerTick: added to the building's own tile while it runs.
  // coolingStrength / coolingRadius: see the heat section.
  buildings: {
    rack_basic: {
      name: 'Rack', category: 'rack', cost: 1000, upkeepPerTick: 0.8, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
    },
    power_basic: {
      name: 'Power unit', category: 'power', cost: 1500, upkeepPerTick: 0.3, incomePerTick: 0,
      powerDraw: 0, powerSupply: 20, heatPerTick: 0.3, coolingStrength: 0, coolingRadius: 0,
    },
    cooling_fan: {
      name: 'Cooling unit', category: 'cooling', cost: 1200, upkeepPerTick: 0.4, incomePerTick: 0,
      powerDraw: 3, powerSupply: 0, heatPerTick: 0,
      // Tuned so one unit keeps a 3x3 rack block warm but alive, two keep it cool.
      coolingStrength: 0.03, coolingRadius: 2,
    },
  },
  power: {
    // Supply from the building's own mains connection, before any power units.
    baseSupply: 12,
  },
  heat: {
    // All temperatures in °C.
    ambient: 22,
    // Racks above this glow as a warning.
    warnTemp: 35,
    // Racks above this fail.
    failTemp: 45,
    // Fraction of the temperature difference that flows to each neighbour per tick.
    // Higher spreads heat further, so clusters matter less.
    diffusion: 0.03,
    // Fraction of the excess over ambient lost per tick on every tile.
    // Each cooling building adds its coolingStrength to this on every tile
    // within coolingRadius (square area).
    leak: 0.01,
  },
  contracts: {
    // Offers on the board, replaced at the start of each game day.
    offersPerDay: 3,
    // Contract pay per rack per tick = this * the customer's pay multiplier.
    // Matches a full walk-in rack so multipliers read as "x times walk-in".
    basePayPerRackPerTick: 2.4,
    // Past contracts remembered for the UI.
    historyLength: 10,
  },
  progression: {
    // XP needed to go from level L to L + 1 = xpBase * L ^ xpExponent.
    // Works at any level: there is no max level.
    xpBase: 100,
    xpExponent: 1.5,
    // How many goals are shown (and can be completed) at once.
    maxActiveGoals: 5,
    // Small trickle for building anything, capped per game day so spamming
    // (or build-and-sell loops) can't level you.
    buildXp: 10,
    buildXpDailyCap: 50,
    // Beating your best single-day profit. At most once per day by nature.
    profitRecordXp: 50,
  },
  save: {
    // The save format version lives in src/sim/save.ts with its migrations.
    storageKey: 'datacentre-tycoon.save',
    settingsKey: 'datacentre-tycoon.settings',
    autosaveSeconds: 30,
  },
  camera: {
    // Degrees from horizontal. 90 would be straight down.
    pitchDeg: 60,
    // Slight rotation around the vertical axis.
    yawDeg: 30,
    // World units visible vertically at zoom 1.
    viewHeight: 18,
    minZoom: 0.5,
    maxZoom: 3,
    zoomStep: 1.1,
    // World units per second for keyboard panning at zoom 1.
    keyPanSpeed: 12,
  },
  rack: {
    width: 0.8,
    depth: 0.8,
    height: 1.6,
  },
} as const;

export type Speed = (typeof CONFIG.time.speeds)[number];
export type BuildingKind = keyof typeof CONFIG.buildings;
export type BuildingCategory = 'rack' | 'power' | 'cooling';
export const BUILDING_KINDS = Object.keys(CONFIG.buildings) as BuildingKind[];

export interface BuildingDef {
  readonly name: string;
  readonly category: BuildingCategory;
  readonly cost: number;
  readonly upkeepPerTick: number;
  readonly incomePerTick: number;
  readonly powerDraw: number;
  readonly powerSupply: number;
  readonly heatPerTick: number;
  readonly coolingStrength: number;
  readonly coolingRadius: number;
}

// Typed lookup so every building has the same fields whatever its id.
export function buildingDef(kind: BuildingKind): BuildingDef {
  return CONFIG.buildings[kind];
}

export function isBuildingKind(id: string): id is BuildingKind {
  return Object.hasOwn(CONFIG.buildings, id);
}
