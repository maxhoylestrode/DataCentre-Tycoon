import type { RoomStyle } from './types';

// Room looks, bought once from the Style panel and switched freely after.
// The first style in each slot is the default every game starts with.
// Only the active style in each slot counts towards prestige.
export const ROOM_STYLES: RoomStyle[] = [
  { id: 'floor_standard', slot: 'floor', name: 'Grey tiles', level: 1, cost: 0, prestige: 0, color: 0xb9bec6 },
  { id: 'floor_dark', slot: 'floor', name: 'Dark anti-static tiles', level: 4, cost: 2500, prestige: 3, color: 0x4a5059 },
  { id: 'floor_raised_white', slot: 'floor', name: 'White raised floor', level: 10, cost: 8000, prestige: 6, color: 0xe8ecf0 },
  { id: 'floor_carbon', slot: 'floor', name: 'Carbon black', level: 20, cost: 25000, prestige: 10, color: 0x23262b },

  { id: 'wall_grey', slot: 'wall', name: 'Concrete grey', level: 1, cost: 0, prestige: 0, color: 0x6d7682 },
  { id: 'wall_navy', slot: 'wall', name: 'Navy', level: 5, cost: 2000, prestige: 3, color: 0x223a5e },
  { id: 'wall_white', slot: 'wall', name: 'Clean white', level: 9, cost: 5000, prestige: 5, color: 0xdfe3e8 },
  { id: 'wall_brick', slot: 'wall', name: 'Warm brick', level: 15, cost: 12000, prestige: 8, color: 0x8a4b36 },

  { id: 'light_standard', slot: 'lighting', name: 'Standard', level: 1, cost: 0, prestige: 0, color: 0xffffff, intensity: 1 },
  { id: 'light_cool_blue', slot: 'lighting', name: 'Cool blue', level: 7, cost: 4000, prestige: 4, color: 0xcfe2ff, intensity: 1, accent: 0x2f6bff },
  { id: 'light_neon', slot: 'lighting', name: 'Neon purple', level: 16, cost: 15000, prestige: 9, color: 0xe6dcff, intensity: 0.9, accent: 0xa346e6 },
];
