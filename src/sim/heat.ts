// Per-tile temperature. Each tick, running buildings add heat to their tile,
// heat spreads to neighbouring tiles, every tile slowly leaks heat back
// towards ambient, and cooling units pull nearby tiles down faster.

import { CONFIG } from '../config';
import { buildingStats } from './buildings';
import { categoryOf, type GameState, isRunning, tempAt } from './state';

const H = CONFIG.heat;

export function stepHeat(state: GameState, efficiency: number): void {
  const { width: w, height: h, temps } = state;
  const heatIn = new Array<number>(w * h).fill(0);
  const cooling = new Array<number>(w * h).fill(0);

  for (const b of state.buildings) {
    if (!isRunning(b)) continue;
    const def = buildingStats(b);
    // Racks and coolers slow down in a brownout; power units do not.
    const scale = def.powerDraw > 0 ? efficiency : 1;
    heatIn[b.y * w + b.x]! += def.heat * scale;

    if (def.coolingStrength > 0) {
      const r = def.coolingRadius;
      for (let y = Math.max(0, b.y - r); y <= Math.min(h - 1, b.y + r); y++) {
        for (let x = Math.max(0, b.x - r); x <= Math.min(w - 1, b.x + r); x++) {
          cooling[y * w + x]! += def.coolingStrength * scale;
        }
      }
    }
  }

  const next = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = temps[i]!;
      // Walls insulate: only in-grid neighbours exchange heat.
      let flow = 0;
      if (x > 0) flow += temps[i - 1]! - t;
      if (x < w - 1) flow += temps[i + 1]! - t;
      if (y > 0) flow += temps[i - w]! - t;
      if (y < h - 1) flow += temps[i + w]! - t;

      // Capped so many overlapping coolers can't overshoot below ambient.
      const loss = Math.min(0.9, H.leak + cooling[i]!) * (t - H.ambient);
      next[i] = Math.max(H.ambient, t + heatIn[i]! + H.diffusion * flow - loss);
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
