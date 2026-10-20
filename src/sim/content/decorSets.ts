import type { DecorSet } from './types';

// Decorations that look good together. Owning one of each item in a set
// (built, anywhere you own) adds the set's prestige on top of the items' own.
// Add entries to add sets; an item can be in more than one.
export const DECOR_SETS: DecorSet[] = [
  {
    id: 'set_lounge',
    name: 'Lounge',
    items: ['sofa', 'coffee_table', 'rug', 'floor_lamp', 'bean_bag'],
    prestige: 6,
  },
  {
    id: 'set_meeting',
    name: 'Meeting space',
    items: ['meeting_table', 'whiteboard', 'bookshelf', 'world_clocks', 'phone_booth'],
    prestige: 8,
  },
  {
    id: 'set_cafe',
    name: 'Café',
    items: ['water_cooler', 'vending_machine', 'espresso_bar', 'bench'],
    prestige: 8,
  },
  {
    id: 'set_garden',
    name: 'Indoor garden',
    items: ['plant_small', 'plant_tree', 'cactus', 'bonsai', 'rock_garden', 'fountain'],
    prestige: 12,
  },
  {
    id: 'set_games',
    name: 'Games room',
    items: ['arcade_cabinet', 'pinball', 'ping_pong', 'pool_table', 'racing_sim'],
    prestige: 15,
  },
  {
    id: 'set_gallery',
    name: 'Gallery',
    items: ['sculpture', 'circuit_art', 'piano', 'founder_bust', 'server_showcase'],
    prestige: 25,
  },
  {
    id: 'set_hq',
    name: 'Hyperscale HQ',
    items: ['hologram_globe', 'hq_logo_wall', 'atrium_tree', 'data_waterfall', 'golden_server'],
    prestige: 80,
  },
];
