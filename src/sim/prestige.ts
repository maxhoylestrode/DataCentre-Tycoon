// Prestige: how good the datacentre looks. Decorations, completed decor sets
// and the active room styles add to it; it slightly improves contract offers.

import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { DECOR_SETS } from './content/decorSets';
import { ROOM_STYLES } from './content/styles';
import type { DecorSet } from './content/types';
import type { GameState } from './state';

const P = CONFIG.prestige;

// How many of a set's items you have built.
export function decorSetProgress(state: GameState, set: DecorSet): { have: string[]; missing: string[] } {
  const built = new Set(state.buildings.filter((b) => b.status !== 'building').map((b) => b.kind as string));
  return { have: set.items.filter((i) => built.has(i)), missing: set.items.filter((i) => !built.has(i)) };
}

export function completedDecorSets(state: GameState): DecorSet[] {
  return DECOR_SETS.filter((set) => decorSetProgress(state, set).missing.length === 0);
}

// The decor set an item belongs to (the first, if several).
export function decorSetOf(kind: string): DecorSet | undefined {
  return DECOR_SETS.find((s) => s.items.includes(kind));
}

export function prestigeOf(state: GameState): number {
  const decor = state.buildings.reduce((sum, b) => sum + buildingStats(b).prestige, 0);
  const sets = completedDecorSets(state).reduce((sum, s) => sum + s.prestige, 0);
  const active = [state.style.floor, state.style.wall, state.style.lighting];
  const styles = ROOM_STYLES.filter((s) => active.includes(s.id)).reduce((sum, s) => sum + s.prestige, 0);
  return decor + sets + styles;
}

// Extra contract pay, as a fraction (0.1 = +10%).
export function prestigePayBonus(state: GameState): number {
  return Math.min(P.maxPayBonus, prestigeOf(state) * P.payBonusPerPoint);
}

export function prestigeExtraOffers(state: GameState): number {
  return Math.min(P.maxExtraOffers, Math.floor(prestigeOf(state) / P.extraOfferEvery));
}
