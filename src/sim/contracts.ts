// Serving active contracts: which racks each contract uses, uptime, pay,
// and settling contracts when they end. Offers and signing live in
// contractBoard.ts and commands.ts.

import { CONFIG } from '../config';
import { buildingStats, meetsRequirement, rackFill } from './buildings';
import { adjustReputation } from './reputation';
import {
  type Building,
  categoryOf,
  type Contract,
  type ContractResult,
  type ContractTerms,
  type GameState,
  isRunning,
  racksOf,
} from './state';

export interface RackAllocation {
  // Working racks not used by any contract; these earn walk-in income.
  walkIn: Building[];
  // Working racks given to each active contract, by contract id.
  assigned: Map<number, number>;
}

// Shares racks out between contracts. Contracts with requirements pick
// first (only some racks can serve them), then the rest, oldest first.
// Each takes the qualifying racks that would earn least on walk-in (newest,
// least upgraded), since a contract pays the same whichever racks serve it.
function assign(
  state: GameState,
  racks: Building[],
  contracts: ContractTerms[],
): { assigned: Map<number, number>; used: Set<Building> } {
  const walkInValue = (b: Building): number => buildingStats(b).income * rackFill(state, b);
  const pool = [...racks].sort(
    (a, b) => walkInValue(a) - walkInValue(b) || b.builtAtTick - a.builtAtTick || b.id - a.id,
  );
  const order = [...contracts].sort((a, b) => Number(!a.requirement) - Number(!b.requirement) || a.id - b.id);

  const assigned = new Map<number, number>();
  const used = new Set<Building>();
  for (const contract of order) {
    let n = 0;
    for (const rack of pool) {
      if (n >= contract.racks) break;
      if (used.has(rack) || !meetsRequirement(rack, contract.requirement)) continue;
      used.add(rack);
      n++;
    }
    assigned.set(contract.id, n);
  }
  return { assigned, used };
}

export function allocateRacks(state: GameState): RackAllocation {
  const working = state.buildings.filter((b) => categoryOf(b) === 'rack' && isRunning(b));
  const { assigned, used } = assign(state, working, state.contracts.active);
  return { walkIn: working.filter((b) => !used.has(b)), assigned };
}

// Whether you own enough suitable racks (working or not) to take this offer
// on top of your current contracts.
// Clients who need certifications only sign while you hold them all.
export function canTakeOffer(state: GameState, offer: ContractTerms): boolean {
  if (offer.certifications?.some((id) => !state.compliance.held.some((h) => h.id === id))) return false;
  const owned = racksOf(state);
  const { assigned } = assign(state, owned, [...state.contracts.active, offer]);
  return state.contracts.active.every((c) => (assigned.get(c.id) ?? 0) >= c.racks) && assigned.get(offer.id) === offer.racks;
}

// Racks you own that meet a requirement.
export function qualifyingRacks(state: GameState, req: ContractTerms['requirement']): number {
  return racksOf(state).filter((b) => meetsRequirement(b, req)).length;
}

export function contractIncomePerTick(state: GameState, allocation: RackAllocation, efficiency: number): number {
  return state.contracts.active.reduce(
    (sum, c) => sum + (allocation.assigned.get(c.id) ?? 0) * efficiency * c.payPerRackPerTick,
    0,
  );
}

// Racks promised to active contracts.
export function committedRacks(state: GameState): number {
  return state.contracts.active.reduce((sum, c) => sum + c.racks, 0);
}

// Racks owned (working or not) that aren't promised to anyone.
export function freeRacks(state: GameState): number {
  return racksOf(state).length - committedRacks(state);
}

// 1 when nothing has been promised yet.
export function uptimeOf(contract: Contract): number {
  return contract.promisedRackTicks > 0 ? contract.servedRackTicks / contract.promisedRackTicks : 1;
}

// Adds one tick of service to every active contract. A rack in a brownout
// counts as partly served.
export function recordService(state: GameState, allocation: RackAllocation, efficiency: number): void {
  for (const contract of state.contracts.active) {
    contract.promisedRackTicks += contract.racks;
    contract.servedRackTicks += (allocation.assigned.get(contract.id) ?? 0) * efficiency;
  }
}

function settle(state: GameState, contract: Contract, outcome: ContractResult['outcome']): ContractResult {
  const stats = state.progress.stats;
  const uptime = uptimeOf(contract);
  let cash = 0;
  let xp = 0;

  if (outcome === 'completed' && uptime >= contract.sla - 1e-9) {
    cash = contract.bonus;
    xp = contract.xp;
    stats.contractsCompleted += 1;
    if (uptime >= 1 - 1e-9) stats.perfectContracts += 1;
  } else {
    outcome = outcome === 'cancelled' ? 'cancelled' : 'failed';
    cash = -contract.penalty;
    if (outcome === 'failed') stats.contractsFailed += 1;
  }

  state.cash += cash;
  state.progress.xp += xp;
  const R = CONFIG.reputation;
  adjustReputation(state, outcome === 'completed' ? R.contractKept : outcome === 'failed' ? R.contractBroken : R.contractCancelled);
  const result: ContractResult = { name: contract.name, outcome, uptime, cash, xp };
  const history = state.contracts.history;
  history.push(result);
  if (history.length > CONFIG.contracts.historyLength) history.splice(0, history.length - CONFIG.contracts.historyLength);
  return result;
}

// Settles every contract whose time is up.
export function finishContracts(state: GameState): void {
  const ending = state.contracts.active.filter((c) => state.tick >= c.endTick);
  if (ending.length === 0) return;
  state.contracts.active = state.contracts.active.filter((c) => state.tick < c.endTick);
  for (const contract of ending) settle(state, contract, 'completed');
}

// Ends a contract early, paying its penalty.
export function cancelActiveContract(state: GameState, contractId: number): ContractResult | null {
  const contract = state.contracts.active.find((c) => c.id === contractId);
  if (!contract) return null;
  state.contracts.active = state.contracts.active.filter((c) => c.id !== contractId);
  return settle(state, contract, 'cancelled');
}

// Ends a contract early as a broken promise (e.g. a certification it needs
// was revoked), paying its penalty.
export function breakContract(state: GameState, contractId: number): ContractResult | null {
  const contract = state.contracts.active.find((c) => c.id === contractId);
  if (!contract) return null;
  state.contracts.active = state.contracts.active.filter((c) => c.id !== contractId);
  return settle(state, contract, 'failed');
}
