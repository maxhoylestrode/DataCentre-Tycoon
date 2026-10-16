// Player actions. Each command validates, then applies the change to state.
// The renderer and UI never edit state directly; they call these.

import { type BuildingKind, buildingDef, CONFIG, isBuildingKind, type Speed } from '../config';
import { canAfford, repairCost } from './economy';
import { awardBuildXp, checkProgress, isUnlocked } from './progression';
import { categoryOf, type GameState, getBuildingAt, isInBounds } from './state';

export type CommandResult = { ok: true } | { ok: false; reason: string };

export function placeBuilding(state: GameState, kind: BuildingKind, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isBuildingKind(kind)) return { ok: false, reason: 'unknown_kind' };
  if (!isUnlocked(state, kind)) return { ok: false, reason: 'locked' };
  if (!isInBounds(state, x, y)) return { ok: false, reason: 'out_of_bounds' };
  if (getBuildingAt(state, x, y)) return { ok: false, reason: 'occupied' };
  if (!canAfford(state, kind)) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= buildingDef(kind).cost;
  state.buildings.push({
    id: state.nextBuildingId,
    kind,
    x,
    y,
    builtAtTick: state.tick,
    status: 'ok',
    repairDoneTick: null,
  });
  state.nextBuildingId += 1;
  state.progress.stats.built += 1;
  awardBuildXp(state);
  checkProgress(state);
  return { ok: true };
}

export function sellBuilding(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const index = state.buildings.findIndex((b) => b.x === x && b.y === y);
  if (index === -1) return { ok: false, reason: 'empty' };

  const [sold] = state.buildings.splice(index, 1);
  state.cash += buildingDef(sold!.kind).cost * CONFIG.economy.sellRefund;
  return { ok: true };
}

export function repairRack(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const rack = getBuildingAt(state, x, y);
  if (!rack || categoryOf(rack) !== 'rack') return { ok: false, reason: 'no_rack' };
  if (rack.status !== 'failed') return { ok: false, reason: 'not_failed' };
  if (state.cash < repairCost(rack)) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= repairCost(rack);
  rack.status = 'repairing';
  rack.repairDoneTick = state.tick + CONFIG.economy.repairTicks;
  state.progress.stats.repairs += 1;
  checkProgress(state);
  return { ok: true };
}

export function setSpeed(state: GameState, speed: Speed): CommandResult {
  if (!CONFIG.time.speeds.includes(speed)) return { ok: false, reason: 'invalid_speed' };
  state.speed = speed;
  state.paused = false;
  return { ok: true };
}

export function togglePause(state: GameState): CommandResult {
  state.paused = !state.paused;
  return { ok: true };
}
