import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { type GameState, isRunning } from './state';

export function powerSupply(state: GameState): number {
  return state.buildings.reduce<number>((sum, b) => sum + buildingStats(b).powerSupply, CONFIG.power.baseSupply);
}

// What everything that is switched on wants to draw. Failed and repairing racks draw nothing.
export function powerDraw(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + (isRunning(b) ? buildingStats(b).powerDraw : 0), 0);
}

// Brownout: when draw exceeds supply, everything runs at supply / draw.
// 1 means fully powered.
export function powerEfficiency(state: GameState): number {
  const draw = powerDraw(state);
  if (draw <= 0) return 1;
  return Math.min(1, powerSupply(state) / draw);
}
