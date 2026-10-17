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
  type StaffRole,
  type WallKind,
  type ZoneKind,
} from '../config';
import { isRoomBoundaryEdge, isValidWallEdge, wallAt } from './walls';
import { nextUplink } from './network';
import { dismissClient, entrance } from './people';
import { isOwnedTile, nextLotPrice, purchasableLots } from './lots';
import { ROOM_STYLES } from './content/styles';
import { contractBoardOpen, refreshOffers } from './contractBoard';
import { cancelActiveContract, canTakeOffer } from './contracts';
import { canAfford, repairCost } from './economy';
import { buildTicks, investedValue, nextPart, partCost, refurbishCost, slotsOf, upgradeCost } from './buildings';
import { awardBuildXp, checkProgress, isUnlocked, levelOf, upgradeCap } from './progression';
import { categoryOf, floorAt, type GameState, getBuildingAt, isInBounds } from './state';

export type CommandResult = { ok: true } | { ok: false; reason: string };

// With staff simulated, a new building waits for an engineer to come and
// build it; otherwise it's ready at once. rot is the facing in quarter turns.
export function placeBuilding(state: GameState, kind: BuildingKind, x: number, y: number, rot = 0): CommandResult {
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
    status: state.staffSim ? 'building' : 'ok',
    repairDoneTick: null,
    upgrade: 0,
    parts: {},
    rot: ((Math.round(rot) % 4) + 4) % 4,
    refreshedAtTick: state.tick,
    lastServicedTick: state.tick,
    buildRemaining: state.staffSim ? buildTicks(kind) : 0,
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
  // With staff simulated an engineer comes and does the repair; otherwise it's on a timer.
  rack.repairDoneTick = state.staffSim ? null : state.tick + CONFIG.economy.repairTicks;
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
  // A new CPU resets hardware ageing.
  if (slot === 'cpu') rack.refreshedAtTick = state.tick;
  state.progress.stats.upgrades += 1;
  awardBuildXp(state);
  afterProgress(state);
  return { ok: true };
}

export interface UpgradePlan {
  // Each step in order: a level upgrade, or a part for a slot.
  steps: ({ kind: 'level' } | { kind: 'part'; slot: PartSlot; partId: string })[];
  cost: number;
}

// What "Upgrade max" would buy right now, without buying it. Levels go up
// to the cap while cash lasts; racks repeatedly take the cheapest next part
// across all slots, so upgrades spread evenly.
export function planUpgradeMax(state: GameState, x: number, y: number): UpgradePlan {
  const plan: UpgradePlan = { steps: [], cost: 0 };
  const building = getBuildingAt(state, x, y);
  if (!building || state.bankrupt || building.status !== 'ok' || !isUnlocked(state, 'upgrades')) return plan;
  let cash = state.cash;

  if (slotsOf(building).length === 0) {
    if (buildingDef(building.kind).upgrade.output === 0) return plan;
    for (let level = building.upgrade; level < upgradeCap(state); level++) {
      const cost = upgradeCost(building, level);
      if (cash < cost) break;
      cash -= cost;
      plan.cost += cost;
      plan.steps.push({ kind: 'level' });
    }
    return plan;
  }

  // Work on a copy of the rack's parts so nothing changes yet.
  const sim = { ...building, parts: { ...building.parts } };
  const level = levelOf(state);
  for (;;) {
    let best: { slot: PartSlot; partId: string; cost: number } | null = null;
    for (const slot of slotsOf(sim)) {
      const part = nextPart(sim, slot);
      if (!part || part.level > level) continue;
      const cost = partCost(sim, part);
      if (cost <= cash && (!best || cost < best.cost)) best = { slot, partId: part.id, cost };
    }
    if (!best) break;
    sim.parts[best.slot] = best.partId;
    cash -= best.cost;
    plan.cost += best.cost;
    plan.steps.push({ kind: 'part', slot: best.slot, partId: best.partId });
  }
  return plan;
}

// Buys everything planUpgradeMax plans. Returns how many upgrades were bought.
export function upgradeMax(state: GameState, x: number, y: number): number {
  let bought = 0;
  for (const step of planUpgradeMax(state, x, y).steps) {
    const result = step.kind === 'level' ? upgradeBuilding(state, x, y) : upgradePart(state, x, y, step.slot);
    if (!result.ok) break;
    bought++;
  }
  return bought;
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

// What placing this wall kind on this edge would cost: the price, less a
// refund for any different wall it replaces. null when it can't go there.
export function wallPlacementCost(state: GameState, kind: WallKind, x: number, y: number, dir: 'h' | 'v'): number | null {
  if (!isValidWallEdge(state, kind, x, y, dir)) return null;
  const existing = wallAt(state, x, y, dir);
  if (existing?.kind === kind) return null;
  // There's already a wall between rooms; only a doorway or glass can replace it.
  if (!existing && kind === 'wall_basic' && isRoomBoundaryEdge(state, x, y, dir)) return null;
  const refund = existing ? CONFIG.walls[existing.kind].cost * CONFIG.economy.sellRefund : 0;
  return Math.max(0, CONFIG.walls[kind].cost - refund);
}

// Builds a wall on an edge between two tiles. Placing a different kind on
// an existing wall swaps it (e.g. a door into a wall). Front doors go in the
// building's outside walls.
export function placeWall(state: GameState, kind: WallKind, x: number, y: number, dir: 'h' | 'v'): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!isWallKind(kind)) return { ok: false, reason: 'unknown_kind' };
  if (!isUnlocked(state, kind)) return { ok: false, reason: 'locked' };
  if (!isValidWallEdge(state, kind, x, y, dir)) return { ok: false, reason: 'out_of_bounds' };
  const cost = wallPlacementCost(state, kind, x, y, dir);
  if (cost === null) return { ok: false, reason: 'occupied' };
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };

  state.cash -= cost;
  state.walls = state.walls.filter((w) => !(w.x === x && w.y === y && w.dir === dir));
  state.walls.push({ kind, x, y, dir });
  afterProgress(state);
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
  if (state.staffSim && !offer.arrived) return { ok: false, reason: 'client_not_here' };
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
  dismissClient(state, offerId, true);
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

// Turns a building a quarter turn. Free; visual, except that a reception
// desk's queue forms in front of it.
export function rotateBuilding(state: GameState, x: number, y: number): CommandResult {
  const building = getBuildingAt(state, x, y);
  if (!building) return { ok: false, reason: 'empty' };
  building.rot = (building.rot + 1) % 4;
  return { ok: true };
}

// Resets a rack's hardware age without buying a new CPU.
export function refurbishRack(state: GameState, x: number, y: number): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const rack = getBuildingAt(state, x, y);
  if (!rack || categoryOf(rack) !== 'rack') return { ok: false, reason: 'no_rack' };
  if (rack.status !== 'ok') return { ok: false, reason: 'not_working' };
  const cost = refurbishCost(rack);
  if (state.cash < cost) return { ok: false, reason: 'insufficient_funds' };
  state.cash -= cost;
  rack.refreshedAtTick = state.tick;
  state.progress.stats.refurbishes += 1;
  afterProgress(state);
  return { ok: true };
}

// Switches to the next faster internet line.
export function upgradeUplink(state: GameState): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  const next = nextUplink(state);
  if (!next) return { ok: false, reason: 'best_installed' };
  if (next.level > levelOf(state)) return { ok: false, reason: 'locked' };
  if (state.cash < next.cost) return { ok: false, reason: 'insufficient_funds' };
  state.cash -= next.cost;
  state.uplink = next.id;
  afterProgress(state);
  return { ok: true };
}

// Hires a staff member: pays the hiring fee now, and their wage every tick.
export function hireStaff(state: GameState, role: StaffRole): CommandResult {
  if (state.bankrupt) return { ok: false, reason: 'bankrupt' };
  if (!state.staffSim) return { ok: false, reason: 'no_staff' };
  if (!isUnlocked(state, 'staff')) return { ok: false, reason: 'locked' };
  const def = CONFIG.staff.roles[role];
  if (!def) return { ok: false, reason: 'unknown_role' };
  if (state.cash < def.hireFee) return { ok: false, reason: 'insufficient_funds' };
  state.cash -= def.hireFee;
  const [x, y] = entrance(state);
  state.staff.push({ id: state.nextStaffId++, role, founder: false, x, y, path: [], task: null });
  state.progress.stats.staffHired += 1;
  afterProgress(state);
  return { ok: true };
}

// Lets a staff member go: their wage stops; the hiring fee isn't refunded.
export function fireStaff(state: GameState, staffId: number): CommandResult {
  const member = state.staff.find((s) => s.id === staffId);
  if (!member) return { ok: false, reason: 'no_staff' };
  if (member.founder) return { ok: false, reason: 'founder' };
  state.staff = state.staff.filter((s) => s !== member);
  return { ok: true };
}

// Paints (or, with null, clears) a zone on an owned tile. Free.
export function paintZone(state: GameState, kind: ZoneKind | null, x: number, y: number): CommandResult {
  if (!isInBounds(state, x, y) || !isOwnedTile(state, x, y)) return { ok: false, reason: 'not_owned' };
  if (kind !== null && !isUnlocked(state, 'zones')) return { ok: false, reason: 'locked' };
  state.zones = state.zones.filter((z) => !(z.x === x && z.y === y));
  if (kind !== null) state.zones.push({ kind, x, y });
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
