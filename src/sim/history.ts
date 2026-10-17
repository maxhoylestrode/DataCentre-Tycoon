// Stats history for the graphs: one sample per game hour. Money and
// efficiencies are averaged over every tick of the hour; slower-moving
// things (power, bandwidth, temperatures) every few ticks; counts are taken
// at the end of the hour.

import { CONFIG } from '../config';
import type { CostBreakdown, IncomeBreakdown } from './economy';
import { bandwidthDemand, lineCapacity, networkEfficiency } from './network';
import { powerDraw, powerEfficiency, powerSupply } from './power';
import { demandFactor, electricityRate } from './daynight';
import { prestigeOf } from './prestige';
import { reputationDemand } from './reputation';
import { levelOf } from './progression';
import { type GameState, type HistoryField, type HistorySample, isRunning, racksOf, tempAt } from './state';

// Fields averaged over the hour but only measured every this many ticks.
const SLOW_EVERY = 5;

function add(sums: Partial<Record<HistoryField, number>>, field: HistoryField, value: number): void {
  sums[field] = (sums[field] ?? 0) + value;
}

export function recordHistory(state: GameState, income: IncomeBreakdown, costs: CostBreakdown, tax = 0): void {
  const acc = state.history.acc;
  const s = acc.sums;
  acc.ticks += 1;
  add(s, 'income', income.walkIn + income.contracts);
  add(s, 'walkIn', income.walkIn);
  add(s, 'contracts', income.contracts);
  add(s, 'costs', costs.total);
  add(s, 'rent', costs.rent);
  add(s, 'upkeep', costs.upkeep);
  add(s, 'electricity', costs.electricity);
  add(s, 'network', costs.network);
  add(s, 'wages', costs.wages);
  add(s, 'overhead', costs.overhead);
  add(s, 'tax', tax);
  add(s, 'uptime', income.efficiency);
  add(s, 'demand', demandFactor(state) * reputationDemand(state));
  add(s, 'electricityRate', electricityRate(state));
  add(s, 'batteryCharge', state.battery.charge);

  if (acc.ticks % SLOW_EVERY === 1) {
    add(s, 'powerDraw', powerDraw(state) * SLOW_EVERY);
    add(s, 'powerSupply', powerSupply(state) * SLOW_EVERY);
    add(s, 'powerEff', powerEfficiency(state) * SLOW_EVERY);
    add(s, 'networkEff', networkEfficiency(state) * SLOW_EVERY);
    add(s, 'bandwidth', bandwidthDemand(state) * SLOW_EVERY);
    add(s, 'lineCapacity', lineCapacity(state) * SLOW_EVERY);
    const racks = racksOf(state);
    let sum = 0;
    let max: number = CONFIG.heat.ambient;
    for (const r of racks) {
      const t = tempAt(state, r.x, r.y);
      sum += t;
      max = Math.max(max, t);
    }
    add(s, 'avgTemp', (racks.length ? sum / racks.length : CONFIG.heat.ambient) * SLOW_EVERY);
    add(s, 'maxTemp', max * SLOW_EVERY);
  }
  if (acc.ticks < CONFIG.history.sampleTicks) return;

  const n = acc.ticks;
  const sample: HistorySample = { tick: state.tick };
  for (const [field, total] of Object.entries(s) as [HistoryField, number][]) sample[field] = total / n;

  const racks = racksOf(state);
  const contracted = racks.filter(isRunning).length - income.allocation.walkIn.length;
  Object.assign(sample, {
    cash: state.cash,
    racks: racks.length,
    racksRunning: racks.filter(isRunning).length,
    racksFailed: racks.filter((r) => r.status === 'failed' || r.status === 'repairing').length,
    racksContracted: Math.max(0, contracted),
    buildings: state.buildings.length,
    staff: state.staff.length,
    engineers: state.staff.filter((m) => m.role === 'engineer').length,
    technicians: state.staff.filter((m) => m.role === 'technician').length,
    activeContracts: state.contracts.active.length,
    clientsWaiting: state.clients.length,
    prestige: prestigeOf(state),
    level: levelOf(state),
    xp: state.progress.xp,
    researchDone: state.research.done.length,
    market: income.market,
    reputation: state.reputation,
  } satisfies Partial<Record<HistoryField, number>>);

  state.history.samples.push(sample);
  const extra = state.history.samples.length - CONFIG.history.maxSamples;
  if (extra > 0) state.history.samples.splice(0, extra);
  state.history.acc = { ticks: 0, sums: {} };
}
