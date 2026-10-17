import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { hireCandidate, hireStaff, payRansom, placeBuilding, setBatteryMode, trainStaff } from '../src/sim/commands';
import { rollOffer } from '../src/sim/contractBoard';
import { CUSTOMER_TYPES } from '../src/sim/content/customers';
import { demandFactor, electricityRate, hourOf } from '../src/sim/daynight';
import { costBreakdown, incomeBreakdown } from '../src/sim/economy';
import { contractsLocked, ransomCost, triggerEvent } from '../src/sim/events';
import { backupPower, electricityCost, powerSupply, stepBattery } from '../src/sim/power';
import { chargeTax, endOfLifeChance, overheadPerTick, taxFor } from '../src/sim/pressure';
import { totalXpForLevel } from '../src/sim/progression';
import { adjustReputation, reputationDemand, reputationTarget, stepReputation } from '../src/sim/reputation';
import { nextRandom } from '../src/sim/rng';
import { deserialize, serialize } from '../src/sim/save';
import { levelFromJobs, recordJob, refreshCandidates, wageOf, workSpeedOf } from '../src/sim/staff';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { fastNetwork } from './helpers';

const DAY = CONFIG.time.ticksPerDay;

function live(level = 25, opts: { staffSim?: boolean } = {}): GameState {
  const state = createInitialState(20, 14, 1, { liveWorld: true, ...opts });
  state.cash = 100_000_000;
  state.progress.xp = totalXpForLevel(level);
  fastNetwork(state);
  return state;
}

const atHour = (state: GameState, hour: number): void => {
  state.tick = Math.floor(state.tick / DAY) * DAY + hour * 60;
};

describe('day and night', () => {
  it('walk-in demand follows the clock but averages 1 over a day', () => {
    const state = live();
    let sum = 0;
    for (let t = 0; t < DAY; t++) {
      state.tick = t;
      sum += demandFactor(state);
    }
    expect(sum / DAY).toBeCloseTo(1, 2);
    atHour(state, 4);
    const night = demandFactor(state);
    atHour(state, 20);
    expect(demandFactor(state)).toBeGreaterThan(night * 1.8);
  });

  it('electricity is cheap at night and dear at the evening peak', () => {
    const state = live();
    atHour(state, 3);
    expect(electricityRate(state)).toBe(CONFIG.dayNight.nightRate);
    atHour(state, 18);
    expect(electricityRate(state)).toBe(CONFIG.dayNight.peakRate);
    atHour(state, 12);
    expect(electricityRate(state)).toBe(1);
  });

  it('does nothing without a live world', () => {
    const state = createInitialState(20, 14);
    atHour(state, 4);
    expect(demandFactor(state)).toBe(1);
    expect(electricityRate(state)).toBe(1);
    expect(hourOf(state.tick)).toBe(4);
  });

  it('batteries charge at night and cut the peak bill in save mode; reserve mode keeps them full', () => {
    const state = live();
    for (let i = 0; i < 6; i++) placeBuilding(state, 'rack_basic', i * 2, 3);
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'power_basic', 1, 0);
    placeBuilding(state, 'ups_battery', 3, 0);
    state.battery.charge = 0.5;
    atHour(state, 2);
    stepBattery(state);
    expect(state.battery.charge).toBeGreaterThan(0.5);
    atHour(state, 18);
    const charged = state.battery.charge;
    const withBattery = electricityCost(state);
    setBatteryMode(state, 'reserve');
    expect(electricityCost(state)).toBeGreaterThan(withBattery);
    stepBattery(state);
    expect(state.battery.charge).toBe(charged);
    setBatteryMode(state, 'save');
    stepBattery(state);
    expect(state.battery.charge).toBeLessThan(charged);
  });

  it('a power cut drains the batteries; empty batteries cover nothing', () => {
    const state = live();
    placeBuilding(state, 'power_basic', 0, 0);
    placeBuilding(state, 'ups_battery', 2, 0);
    atHour(state, 12);
    triggerEvent(state, 'power_cut');
    const covered = powerSupply(state);
    stepBattery(state);
    expect(state.battery.charge).toBeLessThan(1);
    state.battery.charge = 0;
    expect(powerSupply(state)).toBeLessThan(covered);
    expect(backupPower(state)).toBeGreaterThan(0);
  });
});

describe('reputation', () => {
  it('is neutral at 50 and scales demand either way', () => {
    const state = live();
    expect(reputationDemand(state)).toBeCloseTo(1);
    state.reputation = 100;
    expect(reputationDemand(state)).toBeCloseTo(CONFIG.reputation.maxDemand);
    state.reputation = 0;
    expect(reputationDemand(state)).toBeCloseTo(CONFIG.reputation.minDemand);
  });

  it('heads up with perfect uptime and down with failed racks', () => {
    const state = live();
    for (let i = 0; i < 4; i++) placeBuilding(state, 'rack_basic', i * 2, 3);
    expect(reputationTarget(state, 1)).toBeGreaterThan(50);
    for (const r of state.buildings) r.status = 'failed';
    expect(reputationTarget(state, 1)).toBeLessThan(50);
    state.tick = 60;
    stepReputation(state, 1);
    expect(state.reputation).toBeLessThan(50);
  });

  it('breaking a promise costs more than keeping one earns, and difficulty scales losses', () => {
    const normal = live();
    const tough = live();
    tough.difficulty = 'tough';
    adjustReputation(normal, CONFIG.reputation.contractBroken);
    adjustReputation(tough, CONFIG.reputation.contractBroken);
    expect(tough.reputation).toBeLessThan(normal.reputation);
    expect(-CONFIG.reputation.contractBroken).toBeGreaterThan(CONFIG.reputation.contractKept);
  });
});

describe('pressure', () => {
  it('overhead starts past the free racks and grows faster than the rack count', () => {
    const state = live();
    const fill = (n: number): void => {
      state.buildings = [];
      for (let i = 0; i < n; i++) placeBuilding(state, 'rack_basic', i % 20, Math.floor(i / 20));
    };
    fill(CONFIG.pressure.overheadFreeRacks);
    expect(overheadPerTick(state)).toBe(0);
    fill(80);
    const at80 = overheadPerTick(state);
    fill(140);
    expect(overheadPerTick(state) / 140).toBeGreaterThan(at80 / 80);
  });

  it('tax is banded, scales with difficulty, and is taken as the day goes', () => {
    const state = live();
    expect(taxFor(state, 5_000)).toBe(0);
    expect(taxFor(state, 50_000)).toBeCloseTo(40_000 * 0.2);
    state.progress.stats.dayProfit = 0;
    let taken = 0;
    for (let i = 0; i < 10; i++) {
      state.progress.stats.dayProfit += 20_000;
      taken += chargeTax(state);
    }
    expect(taken).toBeCloseTo(taxFor(state, 200_000));
    state.difficulty = 'relaxed';
    expect(taxFor(state, 200_000)).toBeLessThan(taken);
  });

  it('hardware past its end of life starts failing', () => {
    const state = live();
    expect(endOfLifeChance(state, state.tick)).toBe(0);
    state.tick = (CONFIG.pressure.endOfLifeDays + 20) * DAY;
    expect(endOfLifeChance(state, 0)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) placeBuilding(state, 'rack_basic', i * 2, 3);
    for (const r of state.buildings) r.refreshedAtTick = -100 * DAY;
    state.tick = Math.ceil(state.tick / 60) * 60 + 29;
    for (let i = 0; i < 24 * 60; i++) tick(state);
    expect(state.buildings.some((b) => b.status === 'failed')).toBe(true);
  });

  it('late-game clients want stricter, bigger contracts', () => {
    const early = live(10);
    const late = live(40);
    const type = CUSTOMER_TYPES[0]!;
    const a = rollOffer(early, type);
    const b = rollOffer(late, type);
    expect(b.sla).toBeGreaterThan(a.sla);
    expect(b.racks).toBeGreaterThanOrEqual(a.racks);
  });
});

describe('late-game incidents', () => {
  it('ransomware locks contracts until paid', () => {
    const state = live();
    placeBuilding(state, 'rack_basic', 2, 2);
    triggerEvent(state, 'ransomware');
    expect(contractsLocked(state)).toBe(true);
    expect(incomeBreakdown(state).contractEfficiency).toBe(0);
    const cost = ransomCost(state, 10)!;
    const cash = state.cash;
    expect(payRansom(state, 10).ok).toBe(true);
    expect(state.cash).toBe(cash - cost);
    expect(contractsLocked(state)).toBe(false);
  });

  it('strong firewalls stop ransomware', () => {
    const state = live();
    for (let i = 0; i < 2; i++) placeBuilding(state, 'firewall', i * 2, 0);
    state.uplink = 'uplink_100m';
    const rec = triggerEvent(state, 'ransomware')!;
    expect(rec.good).toBe(true);
    expect(contractsLocked(state)).toBe(false);
  });

  it('a blackout takes more grid power than a power cut', () => {
    const cut = live();
    const black = live();
    for (const s of [cut, black]) placeBuilding(s, 'power_basic', 0, 0);
    triggerEvent(cut, 'power_cut');
    triggerEvent(black, 'blackout');
    expect(powerSupply(black)).toBeLessThan(powerSupply(cut));
  });

  it('a major fire burns more racks than a normal one', () => {
    const small = live();
    const big = live();
    for (const s of [small, big]) for (let x = 4; x < 9; x++) for (let y = 4; y < 9; y++) placeBuilding(s, 'rack_basic', x, y);
    triggerEvent(small, 'fire');
    triggerEvent(big, 'big_fire');
    const burned = (s: GameState): number => s.buildings.filter((b) => b.status === 'failed').length;
    expect(burned(big)).toBeGreaterThan(burned(small));
  });

  it('costs include overhead in a live world only', () => {
    const state = live();
    for (let i = 0; i < 60; i++) placeBuilding(state, 'rack_basic', i % 20, Math.floor(i / 20));
    expect(costBreakdown(state).overhead).toBeGreaterThan(0);
    state.liveWorld = false;
    expect(costBreakdown(state).overhead).toBe(0);
  });
});

describe('staff as people', () => {
  it('level up with jobs, get faster, and cost more', () => {
    const state = live(25, { staffSim: true });
    hireStaff(state, 'technician');
    const m = state.staff.at(-1)!;
    const wage = wageOf(m);
    const speed = workSpeedOf(state, m);
    for (let i = 0; i < CONFIG.staffGrowth.levelJobs[2]!; i++) recordJob(m);
    expect(m.level).toBe(3);
    expect(levelFromJobs(m.jobs)).toBe(3);
    expect(wageOf(m)).toBeGreaterThan(wage);
    expect(workSpeedOf(state, m)).toBeGreaterThan(speed);
  });

  it('night owls are faster at night', () => {
    const state = live(25, { staffSim: true });
    hireStaff(state, 'engineer');
    const m = state.staff.at(-1)!;
    m.trait = 'night_owl';
    atHour(state, 23);
    const night = workSpeedOf(state, m);
    atHour(state, 12);
    expect(night).toBeGreaterThan(workSpeedOf(state, m));
  });

  it('new candidates every day, without changing the game’s random numbers', () => {
    const a = live(25, { staffSim: true });
    const b = live(25, { staffSim: true });
    refreshCandidates(a);
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(nextRandom(a)).toBe(nextRandom(b));
    const c = a.candidates[0]!;
    expect(hireCandidate(a, c.id).ok).toBe(true);
    expect(a.staff.at(-1)).toMatchObject({ name: c.name, level: c.level, trait: c.trait });
    expect(a.candidates.some((x) => x.id === c.id)).toBe(false);
  });

  it('training takes them away, then they come back better', () => {
    const state = live(25, { staffSim: true });
    hireStaff(state, 'engineer');
    const m = state.staff.at(-1)!;
    expect(trainStaff(state, m.id).ok).toBe(true);
    expect(m.level).toBe(2);
    expect(m.trainingUntil).not.toBeNull();
    expect(trainStaff(state, m.id)).toEqual({ ok: false, reason: 'away' });
    for (let i = 0; i <= CONFIG.staffGrowth.trainingTicks; i++) tick(state);
    expect(m.trainingUntil).toBeNull();
    expect(trainStaff(state, m.id, 'electrician')).toEqual({ ok: false, reason: 'cannot_train' });
    m.level = CONFIG.staffGrowth.specialismLevel;
    expect(trainStaff(state, m.id, 'electrician').ok).toBe(true);
    expect(m.specialism).toBe('electrician');
  });
});

describe('save v10', () => {
  it('round-trips the live world and staff details', () => {
    const state = live(25, { staffSim: true });
    state.difficulty = 'tough';
    state.reputation = 66.5;
    state.battery = { charge: 0.3, mode: 'reserve' };
    hireStaff(state, 'engineer');
    const m = state.staff.at(-1)!;
    m.trait = 'speedy';
    m.specialism = 'electrician';
    refreshCandidates(state);
    const loaded = deserialize(serialize(state));
    if (!loaded.ok) throw new Error(loaded.error);
    const s = loaded.state;
    expect(s).toMatchObject({ liveWorld: true, difficulty: 'tough', reputation: 66.5, battery: { charge: 0.3, mode: 'reserve' } });
    expect(s.staff.at(-1)).toMatchObject({ name: m.name, trait: 'speedy', specialism: 'electrician' });
    expect(s.candidates).toEqual(state.candidates);
  });

  it('v10 development saves that lost the live world flag get it back', () => {
    const old = createInitialState(20, 14, 3, { staffSim: true });
    const save = JSON.parse(serialize(old));
    save.version = 10;
    save.data.liveWorld = false;
    const loaded = deserialize(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.liveWorld).toBe(true);
  });

  it('v9 real games join the live world, staff get names, old racks get a grace period', () => {
    const old = createInitialState(20, 14, 3, { staffSim: true });
    old.tick = 100 * DAY;
    placeBuilding(old, 'rack_basic', 4, 4);
    getBuildingAt(old, 4, 4)!.refreshedAtTick = 0;
    const save = JSON.parse(serialize(old));
    save.version = 9;
    for (const k of ['liveWorld', 'difficulty', 'reputation', 'battery', 'candidates', 'candidatesDay', 'nextCandidateId']) delete save.data[k];
    for (const s of save.data.staff) for (const k of ['name', 'level', 'jobs', 'trait', 'specialism', 'trainingUntil']) delete s[k];
    const loaded = deserialize(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.liveWorld).toBe(true);
    expect(loaded.state.staff[0]!.name).toBe('You');
    const rack = getBuildingAt(loaded.state, 4, 4)!;
    expect(endOfLifeChance(loaded.state, rack.refreshedAtTick)).toBe(0);
  });
});
