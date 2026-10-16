import type { Goal } from './types';

// The goal list. Up to CONFIG.progression.maxActiveGoals goals are active at
// once: those not yet completed whose `after` goals are all done, in the
// order listed here. Completing goals reveals the ones that follow.
export const GOALS: Goal[] = [
  {
    id: 'first_rack',
    description: 'Build your first rack',
    condition: { type: 'rackCount', min: 1 },
    reward: { xp: 60 },
  },
  {
    id: 'three_racks',
    description: 'Run 3 racks',
    condition: { type: 'rackCount', min: 3 },
    reward: { xp: 80 },
    after: ['first_rack'],
  },
  {
    id: 'earn_1k',
    description: 'Earn £1,000 in total',
    condition: { type: 'totalEarned', min: 1_000 },
    reward: { xp: 100, cash: 300 },
    after: ['first_rack'],
  },
  {
    id: 'first_power',
    description: 'Build a power unit',
    condition: { type: 'buildingCount', kind: 'power_basic', min: 1 },
    reward: { xp: 120 },
    after: ['three_racks'],
  },
  {
    id: 'net_5',
    description: 'Make £5 / min net',
    condition: { type: 'netIncome', min: 5 },
    reward: { xp: 150, cash: 500 },
    after: ['three_racks'],
  },
  {
    id: 'six_racks',
    description: 'Run 6 racks',
    condition: { type: 'rackCount', min: 6 },
    reward: { xp: 200 },
    after: ['first_power'],
  },
  {
    id: 'day_3',
    description: 'Stay in business until day 3',
    condition: { type: 'day', min: 3 },
    reward: { xp: 150 },
    after: ['earn_1k'],
  },
  {
    id: 'first_cooling',
    description: 'Build a cooling unit',
    condition: { type: 'buildingCount', kind: 'cooling_fan', min: 1 },
    reward: { xp: 200 },
    after: ['six_racks'],
  },
  {
    id: 'earn_10k',
    description: 'Earn £10,000 in total',
    condition: { type: 'totalEarned', min: 10_000 },
    reward: { xp: 300, cash: 1_000 },
    after: ['earn_1k'],
  },
  {
    id: 'ten_racks',
    description: 'Run 10 racks',
    condition: { type: 'rackCount', min: 10 },
    reward: { xp: 350 },
    after: ['first_cooling'],
  },
  {
    id: 'net_15',
    description: 'Make £15 / min net',
    condition: { type: 'netIncome', min: 15 },
    reward: { xp: 400, cash: 1_500 },
    after: ['net_5'],
  },
  {
    id: 'day_10',
    description: 'Stay in business until day 10',
    condition: { type: 'day', min: 10 },
    reward: { xp: 500 },
    after: ['day_3'],
  },
  {
    id: 'earn_50k',
    description: 'Earn £50,000 in total',
    condition: { type: 'totalEarned', min: 50_000 },
    reward: { xp: 600, cash: 3_000 },
    after: ['earn_10k'],
  },
  {
    id: 'twenty_racks',
    description: 'Run 20 racks',
    condition: { type: 'rackCount', min: 20 },
    reward: { xp: 800 },
    after: ['ten_racks'],
  },
  {
    id: 'earn_250k',
    description: 'Earn £250,000 in total',
    condition: { type: 'totalEarned', min: 250_000 },
    reward: { xp: 1_200, cash: 10_000 },
    after: ['earn_50k', 'twenty_racks'],
  },
];
