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
  // upgrade: added per upgrade level, as a fraction of the base value.
  //   output = power supply (power) or cooling strength (cooling).
  //   Racks don't use levels; they upgrade through parts (content/parts.ts).
  //
  // Racks: incomePerTick / powerDraw / heatPerTick are one server with stock
  // parts. A rack model holds partMultiplier servers' worth of parts, so
  // income and part prices scale by it; power and heat scale by powerFactor
  // and heatFactor (bigger racks are more efficient per £, but still hungry).
  // slots: which part slots the rack has (see content/parts.ts).
  //
  // prestige: decoration value (see the prestige section).
  // chillerRange / chillerCapacity: how far a chiller reaches and how many
  // floor vents it can feed.
  buildings: {
    rack_basic: {
      name: 'Entry rack', category: 'rack', cost: 1000, upkeepPerTick: 0.8, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 1, powerFactor: 1, heatFactor: 1,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_performance: {
      name: 'Performance rack', category: 'rack', cost: 5000, upkeepPerTick: 1.8, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 2.5, powerFactor: 2.2, heatFactor: 1.8,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_enterprise: {
      name: 'Enterprise rack', category: 'rack', cost: 15000, upkeepPerTick: 4, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 5, powerFactor: 4, heatFactor: 3.2,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_gpu: {
      // Base includes the stock GPU (NVIDIA T4).
      name: 'GPU compute rack', category: 'rack', cost: 40000, upkeepPerTick: 8, incomePerTick: 5.4,
      powerDraw: 5.5, powerSupply: 0, heatPerTick: 0.95, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 6, powerFactor: 5, heatFactor: 4,
      slots: ['cpu', 'ram', 'storage', 'network', 'gpu', 'cooling'],
    },
    rack_hyperscale: {
      name: 'Hyperscale pod', category: 'rack', cost: 120000, upkeepPerTick: 15, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 12, powerFactor: 9, heatFactor: 6.5,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    power_basic: {
      name: 'Power unit', category: 'power', cost: 1500, upkeepPerTick: 0.3, incomePerTick: 0,
      powerDraw: 0, powerSupply: 20, heatPerTick: 0.3, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    cooling_fan: {
      name: 'Cooling unit', category: 'cooling', cost: 1200, upkeepPerTick: 0.4, incomePerTick: 0,
      powerDraw: 3, powerSupply: 0, heatPerTick: 0,
      // Tuned so one unit keeps a 3x3 rack block warm but alive, two keep it cool.
      coolingStrength: 0.03, coolingRadius: 2,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    cooling_inrow: {
      // Strong but short range: sits in a row of racks.
      name: 'In-row cooler', category: 'cooling', cost: 3500, upkeepPerTick: 0.8, incomePerTick: 0,
      powerDraw: 5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0.08, coolingRadius: 1,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    chiller: {
      // Feeds floor vents within range. Does no cooling on its own.
      name: 'Chiller', category: 'chiller', cost: 6000, upkeepPerTick: 1, incomePerTick: 0,
      powerDraw: 6, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      chillerRange: 4, chillerCapacity: 12,
    },
    plant_small: {
      name: 'Potted plant', category: 'decor', cost: 300, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    light_pillar: {
      name: 'LED light pillar', category: 'decor', cost: 1200, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    plant_tree: {
      name: 'Office tree', category: 'decor', cost: 800, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    desk_reception: {
      name: 'Reception desk', category: 'decor', cost: 3000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 5,
    },
    sign_company: {
      name: 'Company sign', category: 'decor', cost: 5000, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0.3, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 8,
    },
    server_showcase: {
      name: 'Retro server showcase', category: 'decor', cost: 15000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 15,
    },
  },
  // Things painted on the floor layer, which can sit under buildings.
  floors: {
    floor_vent: {
      // Cools only its own tile, and only while a chiller in range feeds it.
      name: 'Floor vent', cost: 300, upkeepPerTick: 0.05, coolingStrength: 0.04,
    },
  },
  // Interior walls, drawn along the lines between tiles. Heat can't spread
  // through them and cooling units only cool their own side.
  walls: {
    wall_basic: { name: 'Wall', cost: 100 },
    wall_door: { name: 'Door', cost: 250 },
    wall_glass: { name: 'Glass wall', cost: 400 },
  },
  wallHeights: {
    // Interior walls are drawn low by default so racks behind them stay
    // visible; the Walls toggle shows them at full room height.
    low: 1.1,
    full: 2.4,
    thickness: 0.1,
  },
  prestige: {
    // Each prestige point adds this much to contract pay, up to the cap.
    payBonusPerPoint: 0.005,
    maxPayBonus: 0.3,
    // One extra contract offer per this many prestige points, up to the cap.
    extraOfferEvery: 25,
    maxExtraOffers: 2,
  },
  upgrades: {
    // Hard cap. The usable cap is also limited to the player's level.
    maxLevel: 10,
    // Upgrading from level L costs cost * firstCostFraction * costGrowth ^ L.
    firstCostFraction: 0.5,
    costGrowth: 1.4,
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
export type BuildingCategory = 'rack' | 'power' | 'cooling' | 'chiller' | 'decor';
export const BUILDING_KINDS = Object.keys(CONFIG.buildings) as BuildingKind[];
export type FloorKind = keyof typeof CONFIG.floors;
export const FLOOR_KINDS = Object.keys(CONFIG.floors) as FloorKind[];
export type PartSlot = 'cpu' | 'ram' | 'storage' | 'network' | 'gpu' | 'cooling';
export type WallKind = keyof typeof CONFIG.walls;
export const WALL_KINDS = Object.keys(CONFIG.walls) as WallKind[];

export function isWallKind(id: string): id is WallKind {
  return Object.hasOwn(CONFIG.walls, id);
}

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
  readonly upgrade: { readonly output: number; readonly powerDraw: number; readonly heat: number };
  // Racks only.
  readonly partMultiplier?: number;
  readonly powerFactor?: number;
  readonly heatFactor?: number;
  readonly slots?: readonly PartSlot[];
  // Decor only.
  readonly prestige?: number;
  // Chillers only.
  readonly chillerRange?: number;
  readonly chillerCapacity?: number;
}

export interface FloorDef {
  readonly name: string;
  readonly cost: number;
  readonly upkeepPerTick: number;
  readonly coolingStrength: number;
}

// Typed lookup so every building has the same fields whatever its id.
export function buildingDef(kind: BuildingKind): BuildingDef {
  return CONFIG.buildings[kind];
}

export function isBuildingKind(id: string): id is BuildingKind {
  return Object.hasOwn(CONFIG.buildings, id);
}

export function floorDef(kind: FloorKind): FloorDef {
  return CONFIG.floors[kind];
}

export function isFloorKind(id: string): id is FloorKind {
  return Object.hasOwn(CONFIG.floors, id);
}
