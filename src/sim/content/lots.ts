import type { Lot } from './types';

// Rooms on the map, by lot column and row (each lot is CONFIG.lots.width ×
// height tiles). The first is where every game starts. Lots extend to the
// right (+col) and towards the camera (+row) so the starting room's back
// walls stay where they are. Add entries to add rooms; ids are stored in saves.
export const LOTS: Lot[] = [
  { id: 'lot_0_0', col: 0, row: 0 },
  { id: 'lot_1_0', col: 1, row: 0 },
  { id: 'lot_0_1', col: 0, row: 1 },
  { id: 'lot_1_1', col: 1, row: 1 },
  { id: 'lot_2_0', col: 2, row: 0 },
  { id: 'lot_2_1', col: 2, row: 1 },
  { id: 'lot_0_2', col: 0, row: 2 },
];

export const STARTING_LOT = 'lot_0_0';
