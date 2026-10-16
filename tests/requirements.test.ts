import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { meetsRequirement, rackCores } from '../src/sim/buildings';
import { placeBuilding, signContract, upgradePart } from '../src/sim/commands';
import { rollOffer } from '../src/sim/contractBoard';
import { canTakeOffer, qualifyingRacks } from '../src/sim/contracts';
import { CUSTOMER_TYPES } from '../src/sim/content/customers';
import { incomeBreakdown } from '../src/sim/economy';
import { totalXpForLevel } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { type ContractTerms, createInitialState, type GameState, getBuildingAt } from '../src/sim/state';

function game(level = 30): GameState {
  const state = createInitialState(20, 14);
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(level);
  for (let x = 0; x < 6; x++) placeBuilding(state, 'power_basic', x, 13);
  return state;
}

function offer(state: GameState, terms: Partial<ContractTerms>): ContractTerms {
  const o: ContractTerms = {
    id: state.contracts.nextId++, customerType: 'saas_platform', name: 'Test Co', racks: 2, days: 1,
    payPerRackPerTick: 8, sla: 0.95, bonus: 0, penalty: 0, xp: 0, ...terms,
  };
  state.contracts.offers.push(o);
  return o;
}

describe('rack specs', () => {
  it('cores per rack = CPU cores per server × servers', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_enterprise', 2, 0);
    expect(rackCores(getBuildingAt(state, 0, 0)!)).toBe(8);
    expect(rackCores(getBuildingAt(state, 2, 0)!)).toBe(8 * CONFIG.buildings.rack_enterprise.partMultiplier);
    upgradePart(state, 0, 0, 'cpu');
    expect(rackCores(getBuildingAt(state, 0, 0)!)).toBe(16);
  });

  it('checks tier, cores and GPU requirements', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_performance', 2, 0);
    placeBuilding(state, 'rack_gpu', 4, 0);
    const [entry, perf, gpu] = [0, 2, 4].map((x) => getBuildingAt(state, x, 0)!);
    expect(meetsRequirement(entry!, undefined)).toBe(true);
    expect(meetsRequirement(entry!, { minRackTier: 2 })).toBe(false);
    expect(meetsRequirement(perf!, { minRackTier: 2 })).toBe(true);
    expect(meetsRequirement(perf!, { minCores: 64 })).toBe(false);
    expect(meetsRequirement(gpu!, { gpu: true })).toBe(true);
    expect(meetsRequirement(perf!, { gpu: true })).toBe(false);
  });
});

describe('contracts with requirements', () => {
  it('can’t be signed with only basic racks', () => {
    const state = game();
    for (let x = 0; x < 4; x++) placeBuilding(state, 'rack_basic', x * 2, 0);
    const o = offer(state, { requirement: { minRackTier: 2 } });
    expect(qualifyingRacks(state, o.requirement)).toBe(0);
    expect(canTakeOffer(state, o)).toBe(false);
    expect(signContract(state, o.id)).toEqual({ ok: false, reason: 'not_enough_racks' });
  });

  it('can be signed once you have enough qualifying racks', () => {
    const state = game();
    placeBuilding(state, 'rack_performance', 0, 0);
    placeBuilding(state, 'rack_performance', 2, 0);
    expect(signContract(state, offer(state, { requirement: { minRackTier: 2 } }).id)).toEqual({ ok: true });
  });

  it('are only served by qualifying racks', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_basic', 2, 0);
    placeBuilding(state, 'rack_performance', 4, 0);
    placeBuilding(state, 'rack_performance', 6, 0);
    signContract(state, offer(state, { racks: 2, requirement: { minRackTier: 2 } }).id);
    const { allocation } = incomeBreakdown(state);
    expect(allocation.walkIn.map((b) => b.kind)).toEqual(['rack_basic', 'rack_basic']);
  });

  it('get first pick of the racks they need, so plain contracts don’t starve them', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_performance', 2, 0);
    // A plain contract signed first could grab the Performance rack...
    signContract(state, offer(state, { racks: 1 }).id);
    // ...but the requirement contract still gets it, and the plain one uses the Entry rack.
    expect(signContract(state, offer(state, { racks: 1, requirement: { minRackTier: 2 } }).id)).toEqual({ ok: true });
    const [plain, picky] = state.contracts.active;
    const { allocation } = incomeBreakdown(state);
    expect(allocation.assigned.get(plain!.id)).toBe(1);
    expect(allocation.assigned.get(picky!.id)).toBe(1);
  });

  it('a failed qualifying rack counts as downtime even if other racks are free', () => {
    const state = game();
    placeBuilding(state, 'rack_basic', 0, 0);
    placeBuilding(state, 'rack_performance', 2, 0);
    signContract(state, offer(state, { racks: 1, requirement: { minRackTier: 2 } }).id);
    getBuildingAt(state, 2, 0)!.status = 'failed';
    const { allocation } = incomeBreakdown(state);
    expect(allocation.assigned.get(state.contracts.active[0]!.id)).toBe(0);
  });

  it('offers copy their customer type’s requirement, and saves keep it', () => {
    const state = game();
    const ai = CUSTOMER_TYPES.find((t) => t.id === 'ai_lab')!;
    const o = rollOffer(state, ai);
    expect(o.requirement).toEqual({ gpu: true });
    state.contracts.offers.push(o);
    const loaded = deserialize(serialize(state));
    expect(loaded.ok && loaded.state.contracts.offers.find((x) => x.id === o.id)!.requirement).toEqual({ gpu: true });
  });
});
