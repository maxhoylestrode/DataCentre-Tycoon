// Per-tile temperature. Each tick, running buildings add heat to their tile,
// heat spreads to neighbouring tiles (but not through walls), every tile
// slowly leaks heat back towards ambient, and cooling units pull nearby
// tiles in their own room down faster.

import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { ambientTemp } from './events';
import { feedVents } from './floor';
import { researchBonus } from './research';
import { categoryOf, type GameState, isRunning, tempAt } from './state';
import { reachableTiles, wallGrid } from './walls';

const H = CONFIG.heat;

export function stepHeat(state: GameState, efficiency: number): void {
  const { width: w, height: h, temps } = state;
  const heatIn = new Array<number>(w * h).fill(0);
  const cooling = new Array<number>(w * h).fill(0);
  const walls = wallGrid(state);
  const coolingBoost = 1 + researchBonus(state, 'coolingStrength');
  // Heatwaves raise the temperature everything cools towards.
  const ambient = ambientTemp(state);

  for (const b of state.buildings) {
    if (!isRunning(b)) continue;
    const def = buildingStats(b);
    // Racks and coolers slow down in a brownout; power units do not.
    const scale = def.powerDraw > 0 ? efficiency : 1;
    heatIn[b.y * w + b.x]! += def.heat * scale;

    if (def.coolingStrength > 0) {
      for (const i of reachableTiles(state, walls, b.x, b.y, def.coolingRadius)) {
        cooling[i]! += def.coolingStrength * scale * coolingBoost;
      }
    }
  }

  // Fed floor vents cool their own tile; the chillers feeding them slow in a brownout.
  const ventStrength = CONFIG.floors.floor_vent.coolingStrength * efficiency * coolingBoost;
  for (const i of feedVents(state).fed) cooling[i]! += ventStrength;

  const next = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = temps[i]!;
      // Walls insulate: only in-grid neighbours with no wall between exchange heat.
      let flow = 0;
      if (x > 0 && !walls.left[i]) flow += temps[i - 1]! - t;
      if (x < w - 1 && !walls.left[i + 1]) flow += temps[i + 1]! - t;
      if (y > 0 && !walls.up[i]) flow += temps[i - w]! - t;
      if (y < h - 1 && !walls.up[i + w]) flow += temps[i + w]! - t;

      // Capped so many overlapping coolers can't overshoot below ambient.
      const loss = Math.min(0.9, H.leak + cooling[i]!) * (t - ambient);
      next[i] = Math.max(Math.min(ambient, t), t + heatIn[i]! + H.diffusion * flow - loss);
    }
  }
  state.temps = next;
}

// Running racks on tiles above failTemp break.
export function failOverheatedRacks(state: GameState): void {
  for (const b of state.buildings) {
    if (categoryOf(b) === 'rack' && isRunning(b) && tempAt(state, b.x, b.y) > H.failTemp) {
      b.status = 'failed';
      state.progress.stats.failures += 1;
    }
  }
}
