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
    // from 1 to 1.1, then by another 30% to 1.43, when money piled up too fast;
    // eased to 1.3 once electricity, saturation and wages took over braking.
    runningCostMultiplier: 1.3,
    // Cash may go this far below zero before bankruptcy. Purchases still need
    // enough positive cash.
    overdraftLimit: 500,
    // How long (ticks) you can stay below the overdraft limit before going
    // bankrupt: 12 game hours to sell something or cancel a contract.
    bankruptcyGraceTicks: 720,
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
      { aboveKw: 150, perKwTick: 0.08 },
      { aboveKw: 400, perKwTick: 0.12 },
    ],
  },
  // Market saturation: walk-in customers run out as you grow. Walk-in racks
  // beyond `freeRacks` earn less: factor = (freeRacks / n) ^ exponent, never
  // below `minFactor`. Racks serving contracts don't count.
  market: {
    freeRacks: 20,
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
  // content/uplinks.ts. Each running rack uses bandwidth in step with what it
  // can earn: `mbpsPerIncome` Mbps per £/tick of income. A stock entry rack
  // (£2.40/tick) uses about 29 Mbps. Demand over the line's speed slows
  // income and contract service like a brownout.
  network: {
    mbpsPerIncome: 12,
  },
  // Power units in a full 2×2 square form a multiblock, each producing this
  // much more.
  multiblock: {
    bonus: 0.25,
  },
  // Staff: engineers build and repair, technicians service racks, account
  // managers sign contracts at reception, sales reps bring in more and better
  // offers (sim/sales.ts). Hiring is a one-off fee; wages are paid every tick.
  // The founder engineer is free. minLevel: player level needed to hire.
  staff: {
    roles: {
      engineer: { name: 'Engineer', hireFee: 2_500, wagePerTick: 0.6, minLevel: 0 },
      technician: { name: 'Technician', hireFee: 1_800, wagePerTick: 0.45, minLevel: 0 },
      account_manager: { name: 'Account manager', hireFee: 6_000, wagePerTick: 1.1, minLevel: 7 },
      sales_rep: { name: 'Sales rep', hireFee: 9_000, wagePerTick: 1.6, minLevel: 10 },
    },
    sales: {
      // Ticks an account manager spends talking to a client before deciding.
      negotiateTicks: 20,
      // Account managers only sign if your recent uptime beats the promised
      // uptime by at least this much, so they don't sign contracts you'd break.
      uptimeMargin: 0.005,
      // Recent uptime is averaged over this many stats samples (game hours).
      uptimeHours: 12,
      // Each sales rep brings one more client a day, up to maxExtraOffers...
      offersPerRep: 1,
      maxExtraOffers: 4,
      // ...and negotiates this much more pay on new offers, up to maxPayBonus.
      payPerRep: 0.03,
      maxPayBonus: 0.15,
    },
    // Tiles per tick at full speed. 0.15 = 1.5 tiles a second at 1x.
    walkSpeed: 0.15,
    // Idle staff look for a new job this often (ticks).
    jobSearchTicks: 5,
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
  // Random events (sim/events.ts), once the 'events' mechanic unlocks. The
  // chance is per game day and grows with the number of racks; it's rolled
  // hourly. Durations are ranges in ticks.
  events: {
    chancePerDay: 0.3,
    chancePerRack: 0.006,
    maxChancePerDay: 0.9,
    // Kinds and how often each is picked (relative weights).
    weights: { power_cut: 3, heatwave: 2, fire: 2, ddos: 2, rush_order: 2, press_visit: 1 },
    // Share of grid-fed supply lost in a power cut (UPS batteries cover it).
    powerCutLoss: 0.7,
    powerCutTicks: [90, 300],
    // Extra ambient temperature (°C) during a heatwave.
    heatwaveBoost: 5,
    heatwaveTicks: [480, 1440],
    // Share of the internet line an attack takes, before firewalls.
    ddosLoss: 0.7,
    ddosTicks: [60, 240],
    // A fire takes out the rack and up to this many racks next to it,
    // unless fire suppression covers it.
    fireSpread: 2,
    // A rush job pays this many minutes of your current income.
    rushOrderMinutes: 120,
    // A press visit pays this per prestige point, plus XP.
    pressCashPerPrestige: 60,
    pressXp: 150,
    // Past events remembered for the UI.
    historyLength: 12,
  },
  // --- The live world (state.liveWorld: on in real games, off in engine tests) ---
  // Difficulty multipliers for the pressure systems below.
  difficulty: {
    relaxed: { name: 'Relaxed', costs: 0.75, tax: 0.6, incidents: 0.6, reputationLoss: 0.6 },
    normal: { name: 'Normal', costs: 1, tax: 1, incidents: 1, reputationLoss: 1 },
    tough: { name: 'Tough', costs: 1.3, tax: 1.25, incidents: 1.5, reputationLoss: 1.5 },
  },
  // Reputation, 0–100 (sim/reputation.ts). 50 is neutral.
  reputation: {
    start: 50,
    // Each game hour it moves this share of the way to its target.
    driftPerHour: 0.06,
    // Target = base + uptime part + prestige part - failures part - heat part.
    base: 50,
    // Uptime 100% adds uptimeRange; uptimeFloor and below subtracts it.
    uptimeFloor: 0.9,
    uptimeRange: 30,
    prestigePer: 0.12,
    prestigeMax: 15,
    // Share of racks failed or overheating, times this, comes off.
    failedWeight: 60,
    hotWeight: 25,
    // Instant changes.
    contractKept: 3,
    contractBroken: -8,
    contractCancelled: -4,
    fire: -5,
    // Walk-in demand runs from minDemand (0) to maxDemand (100); 1 at 50.
    minDemand: 0.7,
    maxDemand: 1.3,
    // Contract pay: ±payRange at 100 / 0.
    payRange: 0.15,
    // One more offer a day at or above `extraOfferAt`; one fewer below `fewerOfferAt`.
    extraOfferAt: 75,
    fewerOfferAt: 25,
  },
  // Costs that grow faster than the company (sim/pressure.ts).
  pressure: {
    // Facility overhead per rack per tick beyond overheadFreeRacks, times
    // (racks / overheadFreeRacks) ^ overheadExponent.
    overheadFreeRacks: 30,
    overheadPerRack: 0.35,
    overheadExponent: 0.5,
    // Corporation tax on each day's profit, marginal bands in £ per day.
    taxBands: [
      { above: 0, rate: 0 },
      { above: 10_000, rate: 0.2 },
      { above: 100_000, rate: 0.35 },
      { above: 500_000, rate: 0.45 },
    ],
    // Racks this many days past their last CPU change or refurbish start failing...
    endOfLifeDays: 60,
    // ...with this chance per game hour for every day past it, capped.
    endOfLifeFailPerDay: 0.0004,
    endOfLifeFailMax: 0.03,
    // Late-game clients (from lateFromLevel): per 10 levels past it, uptime
    // promises rise by lateSlaStep, sizes grow by lateRacksStep and
    // penalties by latePenaltyStep, up to lateMaxSteps.
    lateFromLevel: 20,
    lateSlaStep: 0.01,
    lateRacksStep: 0.5,
    latePenaltyStep: 1,
    lateMaxSteps: 1.5,
  },
  // Late-game incidents (from pressure.lateFromLevel).
  lateEvents: {
    weights: { blackout: 2, ransomware: 2, big_fire: 1 },
    // A long, deep power cut.
    blackoutLoss: 0.9,
    blackoutTicks: [720, 1800],
    // Ransomware: contracts aren't served until it passes or you pay. Firewalls
    // blocking at least `ransomwareShield` of an attack stop it entirely.
    ransomwareTicks: [360, 720],
    ransomwareShield: 0.75,
    // The ransom: this many minutes of income.
    ransomMinutes: 180,
    // A big fire reaches racks this many tiles away, unless suppression covers them.
    bigFireRadius: 2,
  },
  // Day and night (sim/daynight.ts). Hourly walk-in demand, normalised to
  // average 1 at runtime: quiet before dawn, busiest in the evening.
  dayNight: {
    demand: [0.72, 0.66, 0.62, 0.6, 0.6, 0.63, 0.7, 0.8, 0.9, 0.96, 1, 1.03, 1.05, 1.05, 1.05, 1.08, 1.13, 1.2, 1.28, 1.34, 1.36, 1.3, 1.12, 0.9],
    // Electricity price multipliers: cheap at night, dear at the evening peak.
    nightRate: 0.6,
    nightHours: [0, 7],
    peakRate: 1.6,
    peakHours: [17, 21],
    // Ambient temperature swing (°C): warmest at tempPeakHour.
    tempSwing: 2,
    tempPeakHour: 15,
    // UPS batteries hold batteryHours of their backup kW, and charge at this
    // share of capacity per hour at night.
    batteryHours: 4,
    batteryChargePerHour: 0.25,
  },
  // Staff levels, traits and training (sim/staff.ts).
  staffGrowth: {
    // Jobs done to reach each level (index = level - 1).
    levelJobs: [0, 8, 20, 40, 70],
    // Each level past 1: this much faster, and this much higher wage.
    speedPerLevel: 0.08,
    wagePerLevel: 0.1,
    // Candidates: a higher level costs this much more to hire per level.
    feePerLevel: 0.6,
    candidatesPerRole: 3,
    // Training: away for trainingTicks; costs hire fee × level × trainingCost.
    trainingTicks: 360,
    trainingCost: 0.8,
    // Specialisms from this level.
    specialismLevel: 3,
  },
  // Upgradable safety buildings (sim/safety.ts).
  safety: {
    // Each UPS level multiplies its backup kW by this (40 kW → ~800 kW at level 10).
    upsGrowth: 1.35,
    // Each firewall level multiplies the Mbps it filters by this
    // (1 Gbps → ~110 Gbps at level 10). Attacks scale with your line, so the
    // biggest lines need several fully upgraded firewalls.
    firewallGrowth: 1.6,
    // One firewall never blocks more than this share of an attack, however
    // big it is: you need at least two to stop one completely.
    firewallMaxShare: 0.5,
  },
  // Research (content/research.ts): one project at a time, paid upfront.
  research: {
    // Speeds up every project (1 = as listed).
    speed: 1,
  },
  // Selling the company: resets the game for legacy points, which carry over.
  legacy: {
    minLevel: 15,
    // Points = floor(perSqrtMillion * sqrt(company value in £m)).
    perSqrtMillion: 4,
    // Each point: more income and more starting cash, forever.
    incomePerPoint: 0.02,
    startingCashPerPoint: 1000,
  },
  // Certifications (content/certifications.ts, sim/compliance.ts), from the
  // 'compliance' mechanic.
  compliance: {
    // An audit reports this many game days after you apply (and pay).
    auditDays: 1,
    // A daily check that finds a requirement missing puts a certification at
    // risk; still missing this many days later, it's revoked.
    graceDays: 2,
    // While held, this share of the fee is charged every renewEveryDays.
    renewEveryDays: 7,
    renewFraction: 0.2,
    // Reputation lost when one is revoked.
    revokedReputation: -10,
    // Past audits and checks remembered for the UI.
    logLength: 10,
  },
  // Stats history: one sample per game hour, kept for this many samples.
  history: {
    sampleTicks: 60,
    maxSamples: 24 * 14,
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
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 }, gridFed: true,
    },
    // Bigger power sources: more kW per tile and less upkeep per kW as they go
    // up. Four of the same kind in a 2×2 square form a multiblock.
    power_gas: {
      name: 'Gas generator', category: 'power', cost: 5500, upkeepPerTick: 0.75, incomePerTick: 0,
      powerDraw: 0, powerSupply: 60, heatPerTick: 0.5, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    power_solar: {
      // Renewable: its output is free, so it comes off the electricity bill.
      name: 'Solar array', category: 'power', cost: 15000, upkeepPerTick: 0.3, incomePerTick: 0,
      powerDraw: 0, powerSupply: 20, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 }, renewable: true,
    },
    power_fuelcell: {
      name: 'Fuel cell stack', category: 'power', cost: 12500, upkeepPerTick: 1.4, incomePerTick: 0,
      powerDraw: 0, powerSupply: 130, heatPerTick: 0.4, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    power_substation: {
      name: 'Grid substation', category: 'power', cost: 30000, upkeepPerTick: 3, incomePerTick: 0,
      powerDraw: 0, powerSupply: 320, heatPerTick: 0.6, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 }, gridFed: true,
    },
    power_reactor: {
      name: 'Micro reactor', category: 'power', cost: 95000, upkeepPerTick: 8, incomePerTick: 0,
      powerDraw: 0, powerSupply: 1000, heatPerTick: 1.2, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0.15, powerDraw: 0, heat: 0 },
    },
    // Safety: protection against random events (sim/events.ts).
    ups_battery: {
      name: 'UPS battery bank', category: 'safety', cost: 4000, upkeepPerTick: 0.15, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0.05, coolingStrength: 0, coolingRadius: 0,
      // output only marks it upgradable; backup grows by CONFIG.safety.upsGrowth.
      upgrade: { output: 1, powerDraw: 0, heat: 0 }, backupKw: 40,
    },
    fire_suppression: {
      name: 'Fire suppression', category: 'safety', cost: 6000, upkeepPerTick: 0.1, incomePerTick: 0,
      powerDraw: 0.1, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, suppressionRadius: 4,
    },
    firewall: {
      name: 'Firewall appliance', category: 'safety', cost: 9000, upkeepPerTick: 0.25, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0.1, coolingStrength: 0, coolingRadius: 0,
      // output only marks it upgradable; filtering grows by CONFIG.safety.firewallGrowth.
      upgrade: { output: 1, powerDraw: 0.1, heat: 0 }, ddosFilterMbps: 1000,
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
    bench: {
      name: 'Bench', category: 'decor', cost: 500, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    cactus: {
      name: 'Cactus', category: 'decor', cost: 350, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    bookshelf: {
      name: 'Bookshelf', category: 'decor', cost: 900, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    floor_lamp: {
      name: 'Floor lamp', category: 'decor', cost: 700, upkeepPerTick: 0.01, incomePerTick: 0,
      powerDraw: 0.1, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    rug: {
      name: 'Rug', category: 'decor', cost: 800, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    whiteboard: {
      name: 'Whiteboard', category: 'decor', cost: 1100, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    coffee_table: {
      name: 'Coffee table', category: 'decor', cost: 1000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 2,
    },
    bean_bag: {
      name: 'Bean bag', category: 'decor', cost: 650, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    vending_machine: {
      name: 'Vending machine', category: 'decor', cost: 3500, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.5, powerSupply: 0, heatPerTick: 0.03, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    bonsai: {
      name: 'Bonsai tree', category: 'decor', cost: 2200, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    ping_pong: {
      name: 'Table tennis', category: 'decor', cost: 5000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 6,
    },
    pool_table: {
      name: 'Pool table', category: 'decor', cost: 7500, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 7,
    },
    fountain: {
      name: 'Indoor fountain', category: 'decor', cost: 9000, upkeepPerTick: 0.04, incomePerTick: 0,
      powerDraw: 0.3, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 9,
    },
    globe: {
      name: 'Floor globe', category: 'decor', cost: 4000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 5,
    },
    status_wall: {
      name: 'Status dashboard', category: 'decor', cost: 11000, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.4, powerSupply: 0, heatPerTick: 0.02, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 10,
    },
    sculpture: {
      name: 'Abstract sculpture', category: 'decor', cost: 18000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 14,
    },
    circuit_art: {
      name: 'Circuit board art', category: 'decor', cost: 15000, upkeepPerTick: 0.01, incomePerTick: 0,
      powerDraw: 0.1, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 12,
    },
    piano: {
      name: 'Grand piano', category: 'decor', cost: 26000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 18,
    },
    robot_mascot: {
      name: 'Robot mascot', category: 'decor', cost: 45000, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.3, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 28,
    },
    golden_server: {
      name: 'Golden server monument', category: 'decor', cost: 80000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 40,
    },
    world_clocks: {
      name: 'World clocks', category: 'decor', cost: 800, upkeepPerTick: 0.01, incomePerTick: 0,
      powerDraw: 0.1, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 1,
    },
    meeting_table: {
      name: 'Meeting table', category: 'decor', cost: 3000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    pinball: {
      name: 'Pinball machine', category: 'decor', cost: 4500, upkeepPerTick: 0.03, incomePerTick: 0,
      powerDraw: 0.4, powerSupply: 0, heatPerTick: 0.03, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 5,
    },
    phone_booth: {
      name: 'Phone booth', category: 'decor', cost: 2500, upkeepPerTick: 0.01, incomePerTick: 0,
      powerDraw: 0.1, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 3,
    },
    rock_garden: {
      name: 'Zen rock garden', category: 'decor', cost: 6500, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 6,
    },
    espresso_bar: {
      name: 'Espresso bar', category: 'decor', cost: 12000, upkeepPerTick: 0.05, incomePerTick: 0,
      powerDraw: 0.8, powerSupply: 0, heatPerTick: 0.05, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 9,
    },
    glass_floor: {
      name: 'Lit glass floor', category: 'decor', cost: 5000, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0.3, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 5,
    },
    founder_bust: {
      name: "Founder's bust", category: 'decor', cost: 20000, upkeepPerTick: 0, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 15,
    },
    racing_sim: {
      name: 'Racing simulator', category: 'decor', cost: 16000, upkeepPerTick: 0.04, incomePerTick: 0,
      powerDraw: 0.8, powerSupply: 0, heatPerTick: 0.08, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 11,
    },
    // Hyperscale HQ pieces: expensive, and a set together.
    hologram_globe: {
      name: 'Hologram globe', category: 'decor', cost: 120000, upkeepPerTick: 0.1, incomePerTick: 0,
      powerDraw: 1, powerSupply: 0, heatPerTick: 0.05, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 55,
    },
    hq_logo_wall: {
      name: 'HQ logo wall', category: 'decor', cost: 90000, upkeepPerTick: 0.05, incomePerTick: 0,
      powerDraw: 0.6, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 45,
    },
    atrium_tree: {
      name: 'Atrium tree', category: 'decor', cost: 150000, upkeepPerTick: 0.02, incomePerTick: 0,
      powerDraw: 0, powerSupply: 0, heatPerTick: 0, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 65,
    },
    data_waterfall: {
      name: 'Data waterfall', category: 'decor', cost: 200000, upkeepPerTick: 0.12, incomePerTick: 0,
      powerDraw: 1.2, powerSupply: 0, heatPerTick: 0.05, coolingStrength: 0, coolingRadius: 0,
      upgrade: { output: 0, powerDraw: 0, heat: 0 }, prestige: 80,
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
    // Big clients negotiate harder with big providers: once you run more than
    // `freeRacks` racks, new offers pay (freeRacks / racks) ^ exponent as much
    // per rack, never below `minFactor`. Shown in the offer's rate.
    volumeDiscount: { freeRacks: 40, exponent: 0.45, minFactor: 0.45 },
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
export type BuildingCategory = 'rack' | 'power' | 'cooling' | 'chiller' | 'decor' | 'furniture' | 'safety';
// Zones are painted onto tiles; see sim/zones.ts.
export type ZoneKind = 'server' | 'staff' | 'storage';
export const ZONE_KINDS: ZoneKind[] = ['server', 'staff', 'storage'];
export type StaffRole = keyof typeof CONFIG.staff.roles;
export type Difficulty = keyof typeof CONFIG.difficulty;
export const DIFFICULTIES = Object.keys(CONFIG.difficulty) as Difficulty[];
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
  // Power only: output that isn't billed as electricity (e.g. solar).
  readonly renewable?: boolean;
  // Power only: fed from the grid, so a power cut hits it.
  readonly gridFed?: boolean;
  // Safety buildings: UPS backup kW during power cuts, fire suppression
  // radius (square, in tiles), and Mbps of attack traffic a firewall filters.
  // Backup and filtering grow with upgrade level (CONFIG.safety).
  readonly backupKw?: number;
  readonly suppressionRadius?: number;
  readonly ddosFilterMbps?: number;
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
