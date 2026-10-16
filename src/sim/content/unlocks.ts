import type { Unlock } from './types';

// Every building, floor type and mechanic, and the level it unlocks at. The
// build menu, tooltips and level-up popup all read from this table.
// (Rack parts and room styles carry their own level in parts.ts / styles.ts.)
export const UNLOCKS: Unlock[] = [
  { id: 'rack_basic', type: 'building', level: 1 },
  { id: 'power_basic', type: 'building', level: 2 },
  { id: 'wall_basic', type: 'wall', level: 2 },
  { id: 'wall_door', type: 'wall', level: 2 },
  {
    id: 'upgrades',
    type: 'mechanic',
    level: 2,
    name: 'Upgrades',
    description: 'Click a building to upgrade it: better parts for racks, levels for power and cooling.',
  },
  { id: 'cooling_fan', type: 'building', level: 3 },
  {
    id: 'heat_map',
    type: 'mechanic',
    level: 3,
    name: 'Heat map',
    description: 'See the temperature of every tile (H).',
  },
  { id: 'plant_small', type: 'building', level: 3 },
  {
    id: 'room_styles',
    type: 'mechanic',
    level: 4,
    name: 'Room styles',
    description: 'Restyle floors, walls and lighting for prestige (L).',
  },
  { id: 'light_pillar', type: 'building', level: 5 },
  {
    id: 'contract_board',
    type: 'mechanic',
    level: 6,
    name: 'Contract board',
    description: 'Sign customers who pay more for promised uptime (K).',
  },
  { id: 'plant_tree', type: 'building', level: 6 },
  { id: 'rack_performance', type: 'building', level: 8 },
  { id: 'desk_reception', type: 'building', level: 8 },
  { id: 'wall_glass', type: 'wall', level: 8 },
  { id: 'cooling_inrow', type: 'building', level: 9 },
  { id: 'sign_company', type: 'building', level: 10 },
  { id: 'chiller', type: 'building', level: 11 },
  { id: 'floor_vent', type: 'floor', level: 11 },
  { id: 'rack_enterprise', type: 'building', level: 14 },
  { id: 'server_showcase', type: 'building', level: 15 },
  { id: 'rack_gpu', type: 'building', level: 22 },
  { id: 'rack_hyperscale', type: 'building', level: 31 },
];
