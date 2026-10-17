import type { Uplink } from './types';

// Internet line speeds, slowest first. The first is what every game starts
// with. Each step costs `cost` to switch to and `rentalPerTick` while in use.
export const UPLINKS: Uplink[] = [
  { id: 'uplink_100m', name: 'Business broadband', mbps: 100, level: 1, cost: 0, rentalPerTick: 0.05 },
  { id: 'uplink_1g', name: 'Fibre', mbps: 1_000, level: 2, cost: 1_800, rentalPerTick: 0.3 },
  { id: 'uplink_10g', name: 'Leased line', mbps: 10_000, level: 6, cost: 15_000, rentalPerTick: 1.4 },
  { id: 'uplink_40g', name: 'Dedicated 40G', mbps: 40_000, level: 10, cost: 55_000, rentalPerTick: 4 },
  { id: 'uplink_100g', name: 'Carrier 100G', mbps: 100_000, level: 15, cost: 140_000, rentalPerTick: 9 },
  { id: 'uplink_400g', name: 'Backbone 400G', mbps: 400_000, level: 22, cost: 450_000, rentalPerTick: 26 },
  { id: 'uplink_800g', name: 'Twin 400G backbone', mbps: 800_000, level: 30, cost: 1_000_000, rentalPerTick: 48 },
];
