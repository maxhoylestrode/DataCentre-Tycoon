import type { Achievement } from './types';

// One-off bragging rights, separate from the goal list. Earned the first time
// the condition is met, never again.
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_failure',
    name: 'Learning experience',
    description: 'Have a rack overheat and fail',
    condition: { type: 'failures', min: 1 },
    reward: { xp: 50 },
  },
  {
    id: 'first_repair',
    name: 'Back online',
    description: 'Repair a failed rack',
    condition: { type: 'repairs', min: 1 },
    reward: { xp: 50 },
  },
  {
    id: 'power_station',
    name: 'Power station',
    description: 'Own 3 power units',
    condition: { type: 'buildingCount', kind: 'power_basic', min: 3 },
    reward: { xp: 100 },
  },
  {
    id: 'full_house',
    name: 'Full house',
    description: 'Run 30 racks',
    condition: { type: 'rackCount', min: 30 },
    reward: { xp: 250 },
  },
  {
    id: 'broken_promise',
    name: 'Service credits',
    description: 'Fail a contract’s uptime promise',
    condition: { type: 'contractsFailed', min: 1 },
    reward: { xp: 50 },
  },
  {
    id: 'five_nines',
    name: 'Five nines',
    description: 'Complete a contract with 100% uptime',
    condition: { type: 'perfectContracts', min: 1 },
    reward: { xp: 200 },
  },
  {
    id: 'maxed_out',
    name: 'Turned up to 10',
    description: 'Upgrade a building to level 10',
    condition: { type: 'highestUpgrade', min: 10 },
    reward: { xp: 300 },
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Earn £1,000,000 in total',
    condition: { type: 'totalEarned', min: 1_000_000 },
    reward: { xp: 1_000 },
  },
];
