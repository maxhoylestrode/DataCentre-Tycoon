import type { Unlock } from './types';

// Every building and mechanic, and the level it unlocks at. The build menu,
// tooltips and level-up popup all read from this table.
export const UNLOCKS: Unlock[] = [
  { id: 'rack_basic', type: 'building', level: 1 },
  { id: 'power_basic', type: 'building', level: 2 },
  { id: 'cooling_fan', type: 'building', level: 3 },
  {
    id: 'heat_map',
    type: 'mechanic',
    level: 3,
    name: 'Heat map',
    description: 'See the temperature of every tile (H).',
  },
];
