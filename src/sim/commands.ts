// Player actions. Each command validates, then applies the change to state.
// The renderer and UI never edit state directly; they call these.

import { type BuildingKind, buildingDef, CONFIG, isBuildingKind, type Speed } from '../config';
import { contractBoardOpen, refreshOffers } from './contractBoard';
import { cancelActiveContract, freeRacks } from './contracts';
import { canAfford, repairCost } from './economy';
import { investedValue, upgradeCost } from './buildings';
import { awardBuildXp, checkProgress, isUnlocked, upgradeCap } from './progression';
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
    upgrade: 0,
  });
  state.nextBuildingId += 1;
  state.progress.stats.built += 1;
  awardBuildXp(state);
  afterProgress(state);
  return { ok: true };
}

// Goals can complete and levels rise outside a tick (e.g. building while
// paused), which may open the contract board straight away.
function afterProgress(state: GameState): void {
  checkProgress(state);
  refreshOffers(state);
}

export function sellBuilding(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const index = state.buildings.findIndex((b) => b.x === x && b.y === y);
  if (index === -1) return { ok: false, reason: 'empty' };

  const [sold] = state.buildings.splice(index, 1);
  state.cash += investedValue(sold!) * CONFIG.economy.sellRefund;
  return { ok: true };
}

export function upgradeBuilding(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const building = getBuildingAt(state, x, y);
  if (!building) return { ok: false, reason: 'empty' };
  if (building.status !== 'ok') return { ok: false, reason: 'not_working' };
  if (building.upgrade >= upgradeCap(state)) return { ok: false, reason: 'at_cap' };
  const cost = upgradeCost(building);
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= cost;
  building.upgrade += 1;
  state.progress.stats.upgrades += 1;
  // Shares the daily-capped building XP trickle.
  awardBuildXp(state);
  afterProgress(state);
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
  afterProgress(state);
  return { ok: true };
}

// Signs an offer from the board. Needs enough racks not already promised
// to other customers; the racks don't have to be working right now.
export function signContract(state: GameState, offerId: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!contractBoardOpen(state)) return { ok: false, reason: 'locked' };
  const offer = state.contracts.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'no_offer' };
  if (freeRacks(state) < offer.racks) return { ok: false, reason: 'not_enough_racks' };

  state.contracts.offers = state.contracts.offers.filter((o) => o.id !== offerId);
  state.contracts.active.push({
    ...offer,
    startTick: state.tick,
    endTick: state.tick + offer.days * CONFIG.time.ticksPerDay,
    servedRackTicks: 0,
    promisedRackTicks: 0,
  });
  state.progress.stats.contractsSigned += 1;
  afterProgress(state);
  return { ok: true };
}

// Ends a contract early. Costs its penalty.
export function cancelContract(state: GameState, contractId: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!cancelActiveContract(state, contractId)) return { ok: false, reason: 'no_contract' };
  afterProgress(state);
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
