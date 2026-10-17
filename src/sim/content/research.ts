import type { ResearchProject } from './types';

// The research tree. One project runs at a time; it's paid for upfront and
// takes `days` game days. Bonuses of the same kind add up. Projects are a
// money sink for the late game, so the later ones are very expensive.
export const RESEARCH: ResearchProject[] = [
  // Tier I
  {
    id: 'r_efficient_psu', name: 'Efficient power supplies', level: 8, cost: 15_000, days: 1, requires: [],
    description: 'Better PSUs get more out of every power source.',
    effects: [{ kind: 'powerOutput', value: 0.05 }],
  },
  {
    id: 'r_hot_aisle', name: 'Hot aisle containment', level: 8, cost: 18_000, days: 1, requires: [],
    description: 'Keep hot and cold air apart so cooling works harder.',
    effects: [{ kind: 'coolingStrength', value: 0.1 }],
  },
  {
    id: 'r_crm', name: 'Customer relations', level: 8, cost: 20_000, days: 1, requires: [],
    description: 'An account team that negotiates better contract rates.',
    effects: [{ kind: 'contractPay', value: 0.05 }],
  },
  {
    id: 'r_training', name: 'Staff training', level: 10, cost: 35_000, days: 1, requires: [],
    description: 'Certified engineers and technicians work faster.',
    effects: [{ kind: 'staffSpeed', value: 0.15 }],
  },
  // Tier II
  {
    id: 'r_power_factor', name: 'Power factor correction', level: 12, cost: 60_000, days: 2, requires: ['r_efficient_psu'],
    description: 'Less power wasted between the generators and the racks.',
    effects: [{ kind: 'powerOutput', value: 0.1 }],
  },
  {
    id: 'r_free_cooling', name: 'Free-air cooling', level: 12, cost: 70_000, days: 2, requires: ['r_hot_aisle'],
    description: 'Use outside air whenever it is cool enough.',
    effects: [{ kind: 'coolingStrength', value: 0.15 }],
  },
  {
    id: 'r_energy_broker', name: 'Energy broker', level: 12, cost: 80_000, days: 2, requires: ['r_efficient_psu'],
    description: 'Buy electricity in bulk at a better price.',
    effects: [{ kind: 'electricityDiscount', value: 0.1 }],
  },
  {
    id: 'r_marketing', name: 'Marketing campaign', level: 12, cost: 75_000, days: 2, requires: ['r_crm'],
    description: 'More walk-in customers before the local market fills up.',
    effects: [{ kind: 'marketRacks', value: 8 }],
  },
  {
    id: 'r_monitoring', name: 'Predictive monitoring', level: 13, cost: 90_000, days: 2, requires: [],
    description: 'Spot trouble early: fewer random incidents.',
    effects: [{ kind: 'eventChance', value: 0.3 }],
  },
  // Tier III
  {
    id: 'r_lifecycle', name: 'Lifecycle management', level: 18, cost: 200_000, days: 3, requires: ['r_monitoring'],
    description: 'Careful hardware care: racks age much more slowly.',
    effects: [{ kind: 'ageingSlower', value: 0.4 }],
  },
  {
    id: 'r_peering', name: 'Internet peering', level: 18, cost: 180_000, days: 3, requires: [],
    description: 'Swap traffic directly with other networks: less bandwidth used.',
    effects: [{ kind: 'bandwidthSaving', value: 0.25 }],
  },
  {
    id: 'r_sla_engineering', name: 'SLA engineering', level: 18, cost: 250_000, days: 3, requires: ['r_crm'],
    description: 'Clients pay more for proven reliability.',
    effects: [{ kind: 'contractPay', value: 0.1 }],
  },
  {
    id: 'r_automation', name: 'Automation', level: 19, cost: 300_000, days: 3, requires: ['r_training'],
    description: 'Scripts and robots do routine work: lower upkeep.',
    effects: [{ kind: 'upkeepDiscount', value: 0.15 }],
  },
  {
    id: 'r_ppa', name: 'Power purchase agreement', level: 20, cost: 350_000, days: 3, requires: ['r_energy_broker'],
    description: 'A long-term deal with a wind farm.',
    effects: [{ kind: 'electricityDiscount', value: 0.15 }],
  },
  // Tier IV
  {
    id: 'r_liquid_rd', name: 'Liquid cooling R&D', level: 25, cost: 800_000, days: 4, requires: ['r_free_cooling'],
    description: 'In-house cooling research.',
    effects: [{ kind: 'coolingStrength', value: 0.25 }],
  },
  {
    id: 'r_global_brand', name: 'Global brand', level: 25, cost: 1_000_000, days: 4, requires: ['r_marketing'],
    description: 'Everyone knows your name.',
    effects: [{ kind: 'marketRacks', value: 12 }, { kind: 'walkInIncome', value: 0.05 }],
  },
  {
    id: 'r_ai_ops', name: 'AI operations', level: 27, cost: 1_800_000, days: 5, requires: ['r_automation'],
    description: 'An AI tunes every server for you.',
    effects: [{ kind: 'walkInIncome', value: 0.1 }, { kind: 'upkeepDiscount', value: 0.1 }],
  },
  {
    id: 'r_grid_storage', name: 'Grid-scale storage', level: 30, cost: 2_500_000, days: 5, requires: ['r_power_factor'],
    description: 'Massive batteries smooth out every peak.',
    effects: [{ kind: 'powerOutput', value: 0.2 }, { kind: 'eventChance', value: 0.2 }],
  },
  {
    id: 'r_quantum_network', name: 'Quantum-safe network', level: 30, cost: 5_000_000, days: 6, requires: ['r_sla_engineering'],
    description: 'Banks and governments pay a premium.',
    effects: [{ kind: 'contractPay', value: 0.15 }],
  },
];
