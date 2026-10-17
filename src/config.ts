// All tunable numbers live here. Pure data: no Three.js or DOM imports,
// because the sim reads this file too.

export const CONFIG = {
  // The map is a grid of lots (rooms) this size; layout in content/lots.ts.
  // You start owning one and buy more next to it.
  lots: {
    width: 20,
    height: 14,
    // Price of the 1st, 2nd, 3rd... room bought. Past the end, each doubles.
    prices: [200_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000],
  },
  time: {
    // 1 tick = 1 game minute.
    ticksPerDay: 1440,
    // Sim ticks per real second at 1x speed. A game day lasts 144s at 1x.
    ticksPerSecondAt1x: 10,
    // Fastest is 3x: 4x made days fly by too quickly to manage.
    speeds: [1, 2, 3],
    // Safety cap so a long frame (e.g. a background tab) can't freeze the page.
    maxTicksPerFrame: 100,
  },
  economy: {
    startingCash: 5000,
    // Fraction of a building's cost returned when it is sold.
    sellRefund: 0.5,
    // A new rack fills with customers linearly over this many ticks.
    rackRampTicks: 1440,
    // Room cost per tick, charged for every room owned. Must stay well below
    // one full rack's profit, or a single rack can never pay its way.
    rentPerTick: 0.25,
    // Multiplies rent and every building's and floor tile's upkeep. Raised
    // from 1 to 1.1, then by another 30% to 1.43, when money piled up too fast.
    runningCostMultiplier: 1.43,
    // Cash may go this far below zero before bankruptcy. Purchases still need
    // enough positive cash.
    overdraftLimit: 500,
    // Repairing a failed rack costs this fraction of the rack's price...
    repairCostFraction: 0.25,
    // ...and keeps it offline for this many ticks (3 game hours).
    repairTicks: 180,
  },
  // Electricity: billed per kW actually drawn, every tick. Bands are marginal
  // (like tax bands): only the kW above `aboveKw` pay that band's rate, so
  // the early game is cheap and big operations pay more per kW.
  electricity: {
    bands: [
      { aboveKw: 0, perKwTick: 0.03 },
      { aboveKw: 60, perKwTick: 0.05 },
      { aboveKw: 200, perKwTick: 0.08 },
      { aboveKw: 600, perKwTick: 0.12 },
    ],
  },
  // Market saturation: walk-in customers run out as you grow. Walk-in racks
  // beyond `freeRacks` earn less: factor = (freeRacks / n) ^ exponent, never
  // below `minFactor`. Racks serving contracts don't count.
  market: {
    freeRacks: 12,
    exponent: 0.45,
    minFactor: 0.3,
  },
  // Hardware ageing: a rack earns less as its CPU gets older (newer tech
  // arrives). Upgrading the CPU or refurbishing resets the age.
  ageing: {
    // Earning power lost per game month (30 days), down to `floor`.
    lossPerMonth: 0.06,
    floor: 0.55,
    ticksPerMonth: 43_200,
    // Refurbishing costs this fraction of the rack's price plus its CPU's price.
    refurbishFraction: 0.3,
  },
  // Network: one internet line (uplink) for the whole company, see
  // content/uplinks.ts. Each running rack uses bandwidth: its network card's
  // Gbps × average utilisation × servers in the rack. Demand over the line's
  // speed slows income and contract service like a brownout.
  network: {
    utilisation: 0.03,
  },
  // Power units in a full 2×2 square form a multiblock, each producing this
  // much more.
  multiblock: {
    bonus: 0.25,
  },
  // Staff: engineers build and repair, technicians service racks. Hiring is a
  // one-off fee; wages are paid every tick. The founder engineer is free.
  staff: {
    roles: {
      engineer: { name: 'Engineer', hireFee: 2_500, wagePerTick: 0.6 },
      technician: { name: 'Technician', hireFee: 1_800, wagePerTick: 0.45 },
    },
    // Tiles per tick at full speed. 0.15 = 1.5 tiles a second at 1x.
    walkSpeed: 0.15,
    // Staff the company can house without a staff room; each break table in
    // a staff room (with a coffee machine) adds `perBreakTable`.
    baseCapacity: 2,
    perBreakTable: 4,
    // Over capacity, everyone works and walks this much slower.
    tiredSpeed: 0.7,
    // Without a storage room (zone with shelving), building and repairs take this much longer.
    noStorageSlowdown: 1.5,
  },
  // Building takes an engineer this many ticks of work on site (plus walking).
  // Racks scale with tier. Walls and floor tiles are instant.
  construction: {
    rackTicksBase: 50,
    rackTicksPerTier: 12,
    otherTicks: 35,
    smallTicks: 15,
  },
  // Racks need servicing by a technician every `intervalTicks`. Overdue racks
  // earn `overdueFactor` of their income until serviced.
  maintenance: {
    intervalTicks: 4_320,
    workTicks: 40,
    overdueFactor: 0.75,
  },
  // Clients: each contract offer is a person who walks in through an outside
  // door and queues at a reception desk. Only clients who reach the desk
  // can be signed.
  clients: {
    // Ticks between clients arriving each morning.
    spawnGap: 25,
  },
  // Racks in a server zone get this much more income.
  zones: {
    serverRoomBonus: 0.05,
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
      partMultiplier: 1, powerFactor: 1, heatFactor: 1, tier: 1,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_performance: {
      name: 'Performance rack', category: 'rack', cost: 7000, upkeepPerTick: 1.8, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 2.5, powerFactor: 2.2, heatFactor: 1.8, tier: 2,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_enterprise: {
      name: 'Enterprise rack', category: 'rack', cost: 21000, upkeepPerTick: 4, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 5, powerFactor: 4, heatFactor: 3.2, tier: 3,
      slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
    },
    rack_gpu: {
      // Base includes the stock GPU (NVIDIA T4).
      name: 'GPU compute rack', category: 'rack', cost: 56000, upkeepPerTick: 8, incomePerTick: 5.4,
      powerDraw: 5.5, powerSupply: 0, heatPerTick: 0.95, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 6, powerFactor: 5, heatFactor: 4, tier: 4,
      slots: ['cpu', 'ram', 'storage', 'network', 'gpu', 'cooling'],
    },
    rack_hyperscale: {
      name: 'Hyperscale pod', category: 'rack', cost: 168000, upkeepPerTick: 15, incomePerTick: 2.4,
      powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 },
      partMultiplier: 12, powerFactor: 9, heatFactor: 6.5, tier: 5,
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
      upgrade: { output: 0.15, powerDraw: 0.08, heat: 0 },
    },
    cooling_inrow: {
      // Strong but short range: sits in a row of racks.
      name: 'In-row cooler', category: 'cooling', cost: 4900, upkeepPerTick: 0.8, incomePerTick: 0,
      powerDraw: 5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0.08, coolingRadius: 1,
      upgrade: { output: 0.15, powerDraw: 0.08, heat: 0 },
    },
    chiller: {
      // Feeds floor vents within range. Does no cooling on its own. Upgrades add
      // chillerCapacityPerLevel vents per level and +1 range every 3 levels.
      name: 'Chiller', category: 'chiller', cost: 8400, upkeepPerTick: 1, incomePerTick: 0,
      powerDraw: 6, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0.08, heat: 0 },
      chillerRange: 4, chillerCapacity: 12, chillerCapacityPerLevel: 3,
    },
    cooling_ac: {
      // Cools every tile of its room (bounded by walls), gently. Expensive and power-hungry.
      name: 'Room AC unit', category: 'cooling', cost: 60000, upkeepPerTick: 3, incomePerTick: 0,
      powerDraw: 24, powerSupply: 0, heatPerTick: 0, coolingStrength: 0.022, coolingRadius: 99,
      upgrade: { output: 0.15, powerDraw: 0.08, heat: 0 },
    },
    // Furniture for zones (see the zones section): a staff room needs break
    // tables and a coffee machine; a storage room needs shelving.
    break_table: {
      name: 'Break table', category: 'furniture', cost: 900, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, zone: 'staff',
    },
    coffee_machine: {
      name: 'Coffee machine', category: 'furniture', cost: 1500, upkeepPerTick: 0.05, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, zone: 'staff',
    },
    lockers: {
      name: 'Staff lockers', category: 'furniture', cost: 700, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, zone: 'staff', prestige: 1,
    },
    shelving: {
      name: 'Parts shelving', category: 'furniture', cost: 1200, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, zone: 'storage',
    },
    plant_small: {
      name: 'Potted plant', category: 'decor', cost: 420, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    light_pillar: {
      name: 'LED light pillar', category: 'decor', cost: 1680, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    plant_tree: {
      name: 'Office tree', category: 'decor', cost: 1120, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    desk_reception: {
      name: 'Reception desk', category: 'decor', cost: 4200, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 5,
    },
    sign_company: {
      name: 'Company sign', category: 'decor', cost: 7000, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0.3, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 8,
    },
    server_showcase: {
      name: 'Retro server showcase', category: 'decor', cost: 21000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 15,
    },
    water_cooler: {
      name: 'Water cooler', category: 'decor', cost: 600, upkeepPerTick: 0.01, incomePerTick: 0,
      powerDraw: 0.2, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    sofa: {
      name: 'Lounge sofa', category: 'decor', cost: 2400, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 4,
    },
    arcade_cabinet: {
      name: 'Arcade cabinet', category: 'decor', cost: 6000, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.6, powerSupply: 0, heatPerTick: 0.05, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 7,
    },
    neon_sign: {
      name: 'Neon "ONLINE" sign', category: 'decor', cost: 9000, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.4, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 10,
    },
    aquarium: {
      name: 'Aquarium', category: 'decor', cost: 14000, upkeepPerTick: 0.06, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 12,
    },
    trophy_case: {
      name: 'Trophy case', category: 'decor', cost: 30000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 20,
    },
  },
  // Things painted on the floor layer, which can sit under buildings.
  floors: {
    floor_vent: {
      // Cools only its own tile, and only while a chiller in range feeds it.
      name: 'Floor vent', cost: 420, upkeepPerTick: 0.05, coolingStrength: 0.04,
    },
  },
  // Interior walls, drawn along the lines between tiles. Heat can't spread
  // through them and cooling units only cool their own side.
  walls: {
    wall_basic: { name: 'Wall', cost: 100 },
    wall_door: { name: 'Door', cost: 250 },
    wall_glass: { name: 'Glass wall', cost: 400 },
    // Goes in an outer wall of the building. Clients and new staff arrive through it.
    door_outside: { name: 'Front door', cost: 1500 },
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
    // Upgrading from level L costs cost * firstCostFraction * costGrowth ^ L * costMultiplier.
    firstCostFraction: 0.5,
    costGrowth: 1.4,
    // Applies to level upgrades and rack parts alike. Raised from 1 to 1.15
    // when upgrades felt too cheap.
    costMultiplier: 1.15,
    // Scales the extra power every rack part draws: upgrades are power-hungry.
    partPowerMultiplier: 1.6,
    // Scales the income every rack part adds. Lowered from 1 to 0.9 so
    // upgrades take longer to pay for themselves.
    partIncomeMultiplier: 0.9,
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
export type BuildingCategory = 'rack' | 'power' | 'cooling' | 'chiller' | 'decor' | 'furniture';
// Zones are painted onto tiles; see sim/zones.ts.
export type ZoneKind = 'server' | 'staff' | 'storage';
export const ZONE_KINDS: ZoneKind[] = ['server', 'staff', 'storage'];
export type StaffRole = keyof typeof CONFIG.staff.roles;
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
  // Racks only. tier ranks rack models (1 = entry) for contract requirements.
  readonly tier?: number;
  readonly partMultiplier?: number;
  readonly powerFactor?: number;
  readonly heatFactor?: number;
  readonly slots?: readonly PartSlot[];
  // Decor only.
  readonly prestige?: number;
  // Chillers only.
  readonly chillerRange?: number;
  readonly chillerCapacity?: number;
  readonly chillerCapacityPerLevel?: number;
  // Furniture only: the zone it serves.
  readonly zone?: ZoneKind;
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
