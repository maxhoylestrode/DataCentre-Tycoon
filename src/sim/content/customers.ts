import type { CustomerType } from './types';

// Customer types for the contract board. Each day's offers are rolled from
// the types the player's level allows. Bigger customers pay more and
// promise more, and punish failure harder.
export const CUSTOMER_TYPES: CustomerType[] = [
  {
    id: 'local_business',
    name: 'Local business',
    minLevel: 6,
    racks: [1, 2],
    days: [2, 4],
    payMultiplier: [1.3, 1.5],
    sla: [0.9, 0.95],
    bonusFraction: 0.1,
    penaltyFraction: 0.1,
    xp: 80,
    nameSuffixes: ['Bakery', 'Dental', 'Motors', 'Florists', 'Accountants', 'Garage'],
  },
  {
    id: 'startup',
    name: 'Startup',
    minLevel: 6,
    racks: [2, 4],
    days: [3, 6],
    payMultiplier: [1.5, 1.8],
    sla: [0.95, 0.97],
    bonusFraction: 0.15,
    penaltyFraction: 0.2,
    xp: 150,
    nameSuffixes: ['Labs', 'AI', 'Cloud', 'HQ', 'ly', 'Hub'],
  },
  {
    id: 'game_studio',
    name: 'Game studio',
    minLevel: 8,
    racks: [3, 6],
    days: [4, 8],
    payMultiplier: [1.7, 2.0],
    sla: [0.97, 0.985],
    bonusFraction: 0.2,
    penaltyFraction: 0.3,
    xp: 250,
    nameSuffixes: ['Games', 'Interactive', 'Studios', 'Arcade'],
  },
  {
    id: 'online_shop',
    name: 'Online shop',
    minLevel: 10,
    racks: [4, 8],
    days: [5, 10],
    payMultiplier: [1.8, 2.2],
    sla: [0.98, 0.995],
    bonusFraction: 0.25,
    penaltyFraction: 0.4,
    xp: 400,
    nameSuffixes: ['Store', 'Market', 'Direct', 'Outlet', 'Supplies'],
  },
];

export const CUSTOMER_NAME_PREFIXES = [
  'Pixel', 'Nimbus', 'Harbour', 'Bramble', 'Copper', 'Northwind', 'Lumen', 'Quarry',
  'Juniper', 'Atlas', 'Kestrel', 'Maple', 'Orbit', 'Saffron', 'Tidal', 'Vertex',
];
