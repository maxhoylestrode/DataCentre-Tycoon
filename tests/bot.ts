// A scripted player for balance testing. It plays sensibly, not perfectly:
// racks in rows with aisles, power and cooling when needed, staff, zones,
// reception, contracts, upgrades and more rooms. Used by balance.test.ts.

import { buildingDef, CONFIG } from '../src/config';
import {
  claimAchievements,
  buyLot,
  hireStaff,
  paintZone,
  payRansom,
  placeBuilding,
  placeWall,
  refurbishRack,
  repairRack,
  sellBuilding,
  signContract,
  startResearch,
  upgradeMax,
  upgradeUplink,
} from '../src/sim/commands';
import { ageFactor, refurbishCost } from '../src/sim/buildings';
import { canTakeOffer } from '../src/sim/contracts';
import { costBreakdown, costsPerTick, incomeBreakdown, incomePerTick } from '../src/sim/economy';
import { isOwnedTile, lotSize, nextLotPrice, purchasableLots } from '../src/sim/lots';
import { nextUplink, peakBandwidthDemand, uplinkOf } from '../src/sim/network';
import { RESEARCH } from '../src/sim/content/research';
import { isProtectedFromFire, ransomCost } from '../src/sim/events';
import { rackAgeDays } from '../src/sim/pressure';
import { researchStatus } from '../src/sim/research';
import { backupPower, powerDraw, powerSupply, supplyBySource } from '../src/sim/power';
import { isUnlocked, levelOf } from '../src/sim/progression';
import { categoryOf, createInitialState, type GameState, getBuildingAt, racksOf, tempAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';

export interface DayReport {
  day: number;
  level: number;
  racks: number;
  staff: number;
  cash: number;
  income: number; // per minute, average over the day
  costs: number;
  margin: number; // (income - costs) / income
  // End-of-day snapshot, for tuning.
  detail: string;
}

function detail(state: GameState): string {
  const inc = incomeBreakdown(state);
  const c = costBreakdown(state);
  const f = (n: number): string => n.toFixed(0);
  const s = state.progress.stats;
  return `walk ${f(inc.walkIn)} ctr ${f(inc.contracts)} mkt ${inc.market.toFixed(2)} eff ${inc.efficiency.toFixed(2)} | upk ${f(c.upkeep)} elec ${f(c.electricity)} wage ${f(c.wages)} ovh ${f(c.overhead)} | tax ${f(s.lastTax)} rep ${f(state.reputation)} | kW ${f(powerDraw(state))} ctr# ${state.contracts.active.length} lots ${state.ownedLots.length}`;
}

function free(state: GameState, x: number, y: number): boolean {
  return isOwnedTile(state, x, y) && !getBuildingAt(state, x, y);
}

// Rack spots: every other column (aisles between), leaving the edges and a
// strip at the bottom of each room for power, staff and storage.
function rackSpots(state: GameState): [number, number][] {
  const { w, h } = lotSize(state);
  const spots: [number, number][] = [];
  for (const id of state.ownedLots) {
    const [col, row] = id.split('_').slice(1).map(Number);
    for (let y = 1; y < h - 4; y++) for (let x = 2; x < w - 2; x += 2) spots.push([col! * w + x, row! * h + y]);
  }
  return spots;
}

// Power units go in 2x2 blocks along the bottom strip of the starting room.
function powerSpot(state: GameState): [number, number] | null {
  const { w, h } = lotSize(state);
  for (const id of state.ownedLots) {
    const [col, row] = id.split('_').slice(1).map(Number);
    for (let bx = col! * w + 1; bx < col! * w + w - 2; bx += 2) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = bx + dx!;
        const y = row! * h + h - 3 + dy!;
        if (free(state, x, y)) return [x, y];
      }
    }
  }
  return null;
}

function coolSpotNear(state: GameState, x: number, y: number): [number, number] | null {
  for (let r = 1; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if ((x + dx) % 2 === 1 && free(state, x + dx, y + dy)) return [x + dx, y + dy];
    }
  }
  return null;
}

function decide(state: GameState, did: Set<string>): void {
  const level = levelOf(state);
  // Keep running costs in the bank: two game hours early on, half a day once established.
  const reserve = Math.max(1_500, costsPerTick(state) * (racksOf(state).length > 30 ? 720 : 120));
  const spend = (amount: number): boolean => state.cash - amount > reserve;
  // Saving up for something: don't buy racks or upgrades meanwhile.
  let saving = false;

  // Repairs first, and pay off ransomware if we can.
  for (const r of racksOf(state)) if (r.status === 'failed' && spend(0)) repairRack(state, r.x, r.y);
  const ransom = ransomCost(state, incomePerTick(state));
  if (ransom !== null && spend(ransom)) payRansom(state, incomePerTick(state));

  // Power headroom (essential, so it may dip into the reserve).
  // Units and racks still being built count as if they were running.
  const pending = (cat: string): number => state.buildings.filter((b) => b.status === 'building' && categoryOf(b) === cat).length;
  for (let i = 0; i < 4; i++) {
    const supply = powerSupply(state) + pending('power') * CONFIG.buildings.power_basic.powerSupply;
    const draw = powerDraw(state) + pending('rack') * 6;
    if (draw <= supply * 0.85) break;
    // Planning ahead respects the reserve; a real shortage doesn't.
    const shortage = powerDraw(state) > supply;
    if (shortage ? state.cash < buildingDef('power_basic').cost + 200 : !spend(buildingDef('power_basic').cost)) break;
    const spot = powerSpot(state);
    if (!spot || !placeBuilding(state, 'power_basic', spot[0], spot[1]).ok) break;
  }

  // Safety once incidents can happen: UPS for most of the grid supply, fire
  // suppression covering every rack, and a couple of firewalls.
  if (isUnlocked(state, 'events')) {
    const ups = CONFIG.buildings.ups_battery;
    const needBackup = supplyBySource(state).grid * CONFIG.events.powerCutLoss * 0.8;
    if (backupPower(state) + pending('safety') * ups.backupKw < needBackup && spend(ups.cost)) {
      const spot = powerSpot(state);
      if (spot) placeBuilding(state, 'ups_battery', spot[0], spot[1]);
    }
    const exposed = racksOf(state).find((r) => !isProtectedFromFire(state, r.x, r.y));
    if (exposed && pending('safety') === 0 && spend(CONFIG.buildings.fire_suppression.cost)) {
      const spot = coolSpotNear(state, exposed.x, exposed.y);
      if (spot) placeBuilding(state, 'fire_suppression', spot[0], spot[1]);
    }
    const firewalls = state.buildings.filter((b) => b.kind === 'firewall').length;
    if (isUnlocked(state, 'firewall') && racksOf(state).length > 20 && firewalls < 2 && spend(CONFIG.buildings.firewall.cost)) {
      const spot = powerSpot(state);
      if (spot) placeBuilding(state, 'firewall', spot[0], spot[1]);
    }
  }

  // Research the cheapest available project when there's spare cash.
  if (isUnlocked(state, 'research') && !state.research.current) {
    const next = RESEARCH.filter((p) => researchStatus(state, p, level) === 'available').sort((a, b) => a.cost - b.cost)[0];
    if (next && spend(next.cost * 1.5)) startResearch(state, next.id);
  }

  // Bandwidth headroom, planned for the evening peak.
  const next = nextUplink(state);
  const peak = peakBandwidthDemand(state);
  if (next && peak > uplinkOf(state).mbps * 0.85 && next.level <= level) {
    if (spend(next.cost)) upgradeUplink(state);
    else saving = true;
  }
  const lineFull = peak > uplinkOf(state).mbps;
  // Keep batteries full for power cuts.
  state.battery.mode = 'reserve';
  const powerFull = powerDraw(state) > powerSupply(state);

  // Cool the hottest rack if it's getting warm.
  const hot = racksOf(state)
    .filter((r) => r.status === 'ok' && tempAt(state, r.x, r.y) > CONFIG.heat.warnTemp - 3)
    .sort((a, b) => tempAt(state, b.x, b.y) - tempAt(state, a.x, a.y))[0];
  if (hot && isUnlocked(state, 'cooling_fan') && spend(buildingDef('cooling_fan').cost)) {
    const spot = coolSpotNear(state, hot.x, hot.y);
    if (spot) placeBuilding(state, 'cooling_fan', spot[0], spot[1]);
  }

  // Staff: an engineer per few pending builds, a technician per 10 racks.
  if (state.staffSim && isUnlocked(state, 'staff')) {
    const engineers = state.staff.filter((s) => s.role === 'engineer').length;
    const techs = state.staff.filter((s) => s.role === 'technician').length;
    const pending = state.buildings.filter((b) => b.status === 'building').length;
    if ((pending > engineers * 3 || engineers < 2) && spend(CONFIG.staff.roles.engineer.hireFee)) hireStaff(state, 'engineer');
    if (racksOf(state).length > (techs + 1) * 10 && spend(CONFIG.staff.roles.technician.hireFee)) hireStaff(state, 'technician');
  }

  // Zones and furniture once, when unlocked.
  const { h } = lotSize(state);
  if (isUnlocked(state, 'zones') && !did.has('staffroom') && spend(3_000)) {
    for (let x = 14; x < 20; x++) paintZone(state, 'staff', x, h - 1);
    placeBuilding(state, 'coffee_machine', 18, h - 1);
    placeBuilding(state, 'break_table', 16, h - 1);
    did.add('staffroom');
  }
  if (isUnlocked(state, 'shelving') && !did.has('storage') && spend(2_000)) {
    for (let x = 10; x < 14; x++) paintZone(state, 'storage', x, h - 1);
    placeBuilding(state, 'shelving', 12, h - 1);
    did.add('storage');
  }

  // Reception and a front door once the contract board opens.
  if (isUnlocked(state, 'contract_board') && !did.has('reception') && spend(7_000)) {
    placeWall(state, 'door_outside', 8, h, 'h');
    placeBuilding(state, 'desk_reception', 8, h - 2, 0);
    did.add('reception');
  }

  // Sign contracts we can serve, but only while nothing is throttled, the
  // line copes with the peak, and reputation isn't on the floor.
  const healthy = incomeBreakdown(state).efficiency >= 1 && !lineFull && (!state.liveWorld || state.reputation > 30);
  // Claim achievement rewards as they come, like a player would.
  claimAchievements(state);
  if (healthy) for (const offer of [...state.contracts.offers]) if (canTakeOffer(state, offer)) signContract(state, offer.id);

  // Don't queue more building than the engineers can get through.
  const engineers = state.staff.filter((s) => s.role === 'engineer').length;
  if (pending('rack') + pending('power') > engineers * 3) return;

  // Losing money with more walk-in racks than the market wants: sell one.
  const inc = incomeBreakdown(state);
  if (incomePerTick(state) < costsPerTick(state) * 0.95 && inc.allocation.walkIn.length > CONFIG.market.freeRacks + 15) {
    const spare = [...inc.allocation.walkIn].sort((a, b) => a.upgrade - b.upgrade)[0];
    if (spare) sellBuilding(state, spare.x, spare.y);
  }

  if (saving || lineFull || powerFull) return;
  // More racks only while the business is clearly making money.
  const thin = incomePerTick(state) < costsPerTick(state) * 1.12 && racksOf(state).length > 16;

  // More racks: the best model unlocked that we can afford.
  const models = (['rack_enterprise', 'rack_performance', 'rack_basic'] as const).filter((k) => isUnlocked(state, k));
  for (const kind of thin ? [] : models) {
    if (!spend(buildingDef(kind).cost * (racksOf(state).length >= 16 ? 3 : 1))) continue;
    const spot = rackSpots(state).find(([x, y]) => free(state, x, y));
    if (spot) placeBuilding(state, kind, spot[0], spot[1]);
    break;
  }

  // Upgrades with spare cash: the least-upgraded rack first. Past 16 racks,
  // upgrading beats adding more.
  if (!thin && (state.cash > reserve * 3 || (racksOf(state).length >= 16 && state.cash > reserve * 1.5))) {
    const rack = racksOf(state)
      .filter((r) => r.status === 'ok')
      .sort((a, b) => a.upgrade - b.upgrade)[0];
    if (rack) upgradeMax(state, rack.x, rack.y);
  }

  // Refurbish racks that have aged a lot, or are nearing end of life.
  const old = (r: (typeof state.buildings)[number]): boolean =>
    ageFactor(state, r) < 0.8 || rackAgeDays(state, r.refreshedAtTick) > CONFIG.pressure.endOfLifeDays - 5;
  for (const r of racksOf(state)) if (r.status === 'ok' && old(r) && spend(refurbishCost(r))) refurbishRack(state, r.x, r.y);

  // Expand when rich.
  const lot = purchasableLots(state)[0];
  if (lot && state.cash > nextLotPrice(state) * 1.5 && buyLot(state, lot.id).ok) {
    // A door through the wall into the new room so staff can reach it.
    const { w, h: lh } = lotSize(state);
    const [col, row] = lot.id.split('_').slice(1).map(Number);
    for (const dy of [0, 1, -1, 2, -2]) if (placeWall(state, 'wall_door', col! * w, row! * lh + Math.floor(lh / 2) + dy, 'v').ok) break;
    for (const dx of [0, 1, -1, 2, -2]) if (placeWall(state, 'wall_door', col! * w + Math.floor(w / 2) + dx, row! * lh, 'h').ok) break;
  }
}

// Plays `days` days and returns the final state, for debugging the bot.
export function inspectBot(days: number): GameState {
  const state = createInitialState(undefined, undefined, 7, { staffSim: true, liveWorld: true });
  const did = new Set<string>();
  for (let t = 0; t < days * CONFIG.time.ticksPerDay && !state.bankrupt; t++) {
    if (t % 30 === 0) decide(state, did);
    tick(state);
  }
  return state;
}

export function playBot(days: number): DayReport[] {
  const state = createInitialState(undefined, undefined, 7, { staffSim: true, liveWorld: true });
  const did = new Set<string>();
  const reports: DayReport[] = [];
  const day = CONFIG.time.ticksPerDay;
  let income = 0;
  let costs = 0;
  let samples = 0;
  let taxBefore = 0;
  for (let t = 0; t < days * day && !state.bankrupt; t++) {
    if (t % 30 === 0) decide(state, did);
    tick(state);
    if (t % 10 === 0) {
      income += incomePerTick(state);
      costs += costsPerTick(state);
      samples++;
    }
    if ((t + 1) % day === 0) {
      // Tax counts as a cost too (charged as the day's profit builds up).
      costs += ((state.progress.stats.taxPaid - taxBefore) / day) * samples;
      taxBefore = state.progress.stats.taxPaid;
      reports.push({
        day: (t + 1) / day,
        level: levelOf(state),
        racks: state.buildings.filter((b) => categoryOf(b) === 'rack').length,
        staff: state.staff.length,
        cash: Math.round(state.cash),
        income: income / samples,
        costs: costs / samples,
        margin: income > 0 ? (income - costs) / income : 0,
        detail: detail(state),
      });
      income = costs = samples = 0;
    }
  }
  if (state.bankrupt) {
    reports.push({ day: -1, level: 0, racks: 0, staff: 0, cash: Math.round(state.cash), income: 0, costs: 0, margin: -1, detail: detail(state) });
  }
  return reports;
}
