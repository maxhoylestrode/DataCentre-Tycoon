// Player actions. Each command validates, then applies the change to state.
// The renderer and UI never edit state directly; they call these.

import {
  type BuildingKind,
  buildingDef,
  CONFIG,
  type FloorKind,
  floorDef,
  isBuildingKind,
  isFloorKind,
  isWallKind,
  type PartSlot,
  type Speed,
  type WallKind,
} from '../config';
import { isInteriorEdge, isRoomBoundaryEdge, wallAt } from './walls';
import { isOwnedTile, nextLotPrice, purchasableLots } from './lots';
import { ROOM_STYLES } from './content/styles';
import { contractBoardOpen, refreshOffers } from './contractBoard';
import { cancelActiveContract, canTakeOffer } from './contracts';
import { canAfford, repairCost } from './economy';
import { investedValue, nextPart, partCost, slotsOf, upgradeCost } from './buildings';
import { awardBuildXp, checkProgress, isUnlocked, levelOf, upgradeCap } from './progression';
import { categoryOf, floorAt, type GameState, getBuildingAt, isInBounds } from './state';

export type CommandResult = { ok: true } | { ok: false; reason: string };

export function placeBuilding(state: GameState, kind: BuildingKind, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isBuildingKind(kind)) return { ok: false, reason: 'unknown_kind' };
  if (!isUnlocked(state, kind)) return { ok: false, reason: 'locked' };
  if (!isInBounds(state, x, y)) return { ok: false, reason: 'out_of_bounds' };
  if (!isOwnedTile(state, x, y)) return { ok: false, reason: 'not_owned' };
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
    parts: {},
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
  if (slotsOf(building).length > 0) return { ok: false, reason: 'use_parts' };
  if (buildingDef(building.kind).upgrade.output === 0) return { ok: false, reason: 'not_upgradable' };
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

// Swaps a rack's part in one slot for the next one along that slot's path.
export function upgradePart(state: GameState, x: number, y: number, slot: PartSlot): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isUnlocked(state, 'upgrades')) return { ok: false, reason: 'locked' };
  const rack = getBuildingAt(state, x, y);
  if (!rack || !slotsOf(rack).includes(slot)) return { ok: false, reason: 'no_slot' };
  if (rack.status !== 'ok') return { ok: false, reason: 'not_working' };
  const part = nextPart(rack, slot);
  if (!part) return { ok: false, reason: 'best_installed' };
  if (part.level > levelOf(state)) return { ok: false, reason: 'part_locked' };
  const cost = partCost(rack, part);
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= cost;
  rack.parts[slot] = part.id;
  state.progress.stats.upgrades += 1;
  awardBuildXp(state);
  afterProgress(state);
  return { ok: true };
}

// Floor tiles go on their own layer, so they can sit under buildings.
export function placeFloor(state: GameState, kind: FloorKind, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isFloorKind(kind)) return { ok: false, reason: 'unknown_kind' };
  if (!isUnlocked(state, kind)) return { ok: false, reason: 'locked' };
  if (!isInBounds(state, x, y)) return { ok: false, reason: 'out_of_bounds' };
  if (!isOwnedTile(state, x, y)) return { ok: false, reason: 'not_owned' };
  if (floorAt(state, x, y)) return { ok: false, reason: 'occupied' };
  const cost = floorDef(kind).cost;
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= cost;
  state.floor.push({ kind, x, y });
  afterProgress(state);
  return { ok: true };
}

export function removeFloor(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const tile = floorAt(state, x, y);
  if (!tile) return { ok: false, reason: 'empty' };
  state.floor = state.floor.filter((f) => f !== tile);
  state.cash += floorDef(tile.kind).cost * CONFIG.economy.sellRefund;
  return { ok: true };
}

// Builds a wall on an interior edge between two tiles.
export function placeWall(state: GameState, kind: WallKind, x: number, y: number, dir: 'h' | 'v'): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isWallKind(kind)) return { ok: false, reason: 'unknown_kind' };
  if (!isUnlocked(state, kind)) return { ok: false, reason: 'locked' };
  if (!isInteriorEdge(state, x, y, dir)) return { ok: false, reason: 'out_of_bounds' };
  if (wallAt(state, x, y, dir)) return { ok: false, reason: 'occupied' };
  // There's already a wall between rooms; only a doorway or glass can replace it.
  if (kind === 'wall_basic' && isRoomBoundaryEdge(state, x, y, dir)) return { ok: false, reason: 'occupied' };
  const cost = CONFIG.walls[kind].cost;
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= cost;
  state.walls.push({ kind, x, y, dir });
  return { ok: true };
}

export function removeWall(state: GameState, x: number, y: number, dir: 'h' | 'v'): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const wall = wallAt(state, x, y, dir);
  if (!wall) return { ok: false, reason: 'empty' };
  state.walls = state.walls.filter((w) => w !== wall);
  state.cash += CONFIG.walls[wall.kind].cost * CONFIG.economy.sellRefund;
  return { ok: true };
}

// Buys the room (lot) next to one you already own.
export function buyLot(state: GameState, lotId: string): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (state.ownedLots.includes(lotId)) return { ok: false, reason: 'owned' };
  if (!purchasableLots(state).some((l) => l.id === lotId)) return { ok: false, reason: 'not_adjacent' };
  const price = nextLotPrice(state);
  if (state.cash < price) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= price;
  state.ownedLots.push(lotId);
  afterProgress(state);
  return { ok: true };
}

// Buys a room style (once) and makes it active.
export function buyStyle(state: GameState, styleId: string): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isUnlocked(state, 'room_styles')) return { ok: false, reason: 'locked' };
  const style = ROOM_STYLES.find((s) => s.id === styleId);
  if (!style) return { ok: false, reason: 'unknown_style' };
  if (state.style.owned.includes(styleId)) return useStyle(state, styleId);
  if (style.level > levelOf(state)) return { ok: false, reason: 'style_locked' };
  if (state.cash < style.cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= style.cost;
  state.style.owned.push(styleId);
  return useStyle(state, styleId);
}

// Switches to a style already owned. Free.
export function useStyle(state: GameState, styleId: string): CommandResult {
  const style = ROOM_STYLES.find((s) => s.id === styleId);
  if (!style || !state.style.owned.includes(styleId)) return { ok: false, reason: 'not_owned' };
  state.style[style.slot] = styleId;
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
  if (!canTakeOffer(state, offer)) return { ok: false, reason: 'not_enough_racks' };

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
