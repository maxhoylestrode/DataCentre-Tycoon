// Prestige: how good the datacentre looks. Decorations and the active room
// styles add to it; it slightly improves contract offers.

import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { ROOM_STYLES } from './content/styles';
import type { GameState } from './state';

const P = CONFIG.prestige;

export function prestigeOf(state: GameState): number {
  const decor = state.buildings.reduce((sum, b) => sum + buildingStats(b).prestige, 0);
  const active = [state.style.floor, state.style.wall, state.style.lighting];
  const styles = ROOM_STYLES.filter((s) => active.includes(s.id)).reduce((sum, s) => sum + s.prestige, 0);
  return decor + styles;
}

// Extra contract pay, as a fraction (0.1 = +10%).
export function prestigePayBonus(state: GameState): number {
  return Math.min(P.maxPayBonus, prestigeOf(state) * P.payBonusPerPoint);
}

export function prestigeExtraOffers(state: GameState): number {
  return Math.min(P.maxExtraOffers, Math.floor(prestigeOf(state) / P.extraOfferEvery));
}
