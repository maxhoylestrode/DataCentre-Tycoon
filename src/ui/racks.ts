import { buildingDef, CONFIG } from '../config';
import { ageFactor, buildingStats, isOverdue, rackCores, rackTier, refurbishCost, slotsOf } from '../sim/buildings';
import { planUpgradeMax } from '../sim/commands';
import { repairCost } from '../sim/economy';
import { endOfLifeChance, isWorn, rackCondition } from '../sim/pressure';
import { type Building, type GameState, racksOf, tempAt } from '../sim/state';
import { ICONS } from './icons';

export interface RackListHandlers {
  onUpgradeMax(buildingId: number): void;
  onUpgradeAll(): void;
  onRepairAll(): void;
  onRefurbishAll(): void;
  onRefurbish(buildingId: number): void;
  onRepair(buildingId: number): void;
  // Look at the rack and open its panel.
  onFocus(buildingId: number): void;
}

type Sort = 'condition' | 'income' | 'upgrades' | 'location';
type Filter = 'all' | 'attention';

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

// Every rack you own in one list: condition, earnings, what's wrong, and
// buttons to upgrade, refurbish or repair (J).
export class RackListPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private sort: Sort = 'condition';
  private filter: Filter = 'all';
  private lastKey = '';

  constructor(parent: HTMLElement, handlers: RackListHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel racklist-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.racklist}<h2>All racks</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, [data-row]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const id = Number(el.dataset.id);
      const act = el.dataset.act;
      if (act === 'close') return this.toggle(false);
      if (act === 'max') handlers.onUpgradeMax(id);
      else if (act === 'all') handlers.onUpgradeAll();
      else if (act === 'repair-all') handlers.onRepairAll();
      else if (act === 'refurbish-all') handlers.onRefurbishAll();
      else if (act === 'refurbish') handlers.onRefurbish(id);
      else if (act === 'repair') handlers.onRepair(id);
      else if (el.dataset.sort) this.sort = el.dataset.sort as Sort;
      else if (el.dataset.filter) this.filter = el.dataset.filter as Filter;
      else if (el.dataset.row) handlers.onFocus(Number(el.dataset.row));
      this.lastKey = '';
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.lastKey = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    const racks = racksOf(state);
    // Redraw when racks change, every game hour, or when cash moves a lot.
    const key = [
      racks.map((r) => `${r.id}:${r.status}:${Object.values(r.parts).join(',')}:${r.refreshedAtTick}`).join('|'),
      Math.floor(state.tick / 60), Math.floor(state.cash / 500), this.sort, this.filter,
    ].join('/');
    if (key === this.lastKey) return;
    this.lastKey = key;

    const rows = racks.map((r) => {
      const plan = r.status === 'ok' ? planUpgradeMax(state, r.x, r.y) : { steps: [], cost: 0 };
      const condition = rackCondition(state, r);
      const issues: string[] = [];
      if (r.status === 'failed') issues.push('Failed');
      if (r.status === 'repairing') issues.push('Repairing');
      if (r.status === 'building') issues.push('Being built');
      if (endOfLifeChance(state, r.refreshedAtTick) > 0) issues.push('Past end of life');
      else if (condition < 0.2 && r.status === 'ok') issues.push('Nearly worn out');
      if (isOverdue(state, r)) issues.push('Service overdue');
      if (r.status === 'ok' && tempAt(state, r.x, r.y) > CONFIG.heat.warnTemp) issues.push('Hot');
      return { r, plan, condition, issues, income: buildingStats(r).income };
    });
    const shown = rows.filter((x) => this.filter === 'all' || x.issues.length > 0 || x.condition < 0.25);
    shown.sort((a, b) => {
      switch (this.sort) {
        case 'condition': return a.condition - b.condition;
        case 'income': return b.income - a.income;
        case 'upgrades': return b.plan.steps.length - a.plan.steps.length;
        case 'location': return a.r.y - b.r.y || a.r.x - b.r.x;
      }
    });

    const attention = rows.filter((x) => x.issues.length > 0).length;
    const upgradable = rows.filter((x) => x.plan.steps.length > 0).length;
    const avg = rows.length ? rows.reduce((s, x) => s + x.condition, 0) / rows.length : 1;
    const failedRacks = racks.filter((r) => r.status === 'failed');
    const failed = failedRacks.length;
    const repairTotal = failedRacks.reduce((s, r) => s + repairCost(r), 0);
    const wornRacks = racks.filter((r) => isWorn(state, r));
    const worn = wornRacks.length;
    const refurbTotal = wornRacks.reduce((s, r) => s + refurbishCost(r), 0);
    const tab = (kind: 'sort' | 'filter', value: string, label: string, active: boolean): string =>
      `<button data-${kind}="${value}" class="${active ? 'active' : ''}">${label}</button>`;

    this.body.innerHTML = `
      <div class="ct-tiles">
        <div class="ct-tile"><div class="ct-tile-value">${rows.length}</div><div class="ct-tile-label">Racks</div></div>
        <div class="ct-tile ${attention ? 'bad' : 'good'}"><div class="ct-tile-value">${attention}</div><div class="ct-tile-label">Need attention</div></div>
        <div class="ct-tile"><div class="ct-tile-value">${Math.round(avg * 100)}%</div><div class="ct-tile-label">Average condition</div></div>
        <div class="ct-tile accent"><div class="ct-tile-value">${upgradable}</div><div class="ct-tile-label">Can upgrade now</div></div>
      </div>
      <div class="rl-bar">
        <div class="rl-tabs">${tab('filter', 'all', 'All', this.filter === 'all')}${tab('filter', 'attention', 'Needs attention', this.filter === 'attention')}</div>
        <div class="rl-tabs"><span class="muted">Sort</span>${tab('sort', 'condition', 'Condition', this.sort === 'condition')}${tab('sort', 'income', 'Earnings', this.sort === 'income')}${tab('sort', 'upgrades', 'Upgrades', this.sort === 'upgrades')}${tab('sort', 'location', 'Location', this.sort === 'location')}</div>
        <div class="rl-bulk">
          <button data-act="repair-all" ${failed ? '' : 'disabled'} title="Repairs every failed rack you can afford">🔧 Repair all${failed ? ` (${failed}) · ${money(repairTotal)}` : ''}</button>
          <button data-act="refurbish-all" ${worn ? '' : 'disabled'} title="Refurbishes every rack past or near end of life (condition under 35%), oldest first">♻ Replace worn hardware${worn ? ` (${worn}) · ${money(refurbTotal)}` : ''}</button>
          <button data-act="all" class="primary" ${upgradable ? '' : 'disabled'} title="Max-upgrades every rack, cheapest first, while the money lasts">⏫ Upgrade all</button>
        </div>
      </div>
      <div class="rl-list">
        ${shown.map((x) => this.row(state, x.r, x.condition, x.income, x.issues, x.plan)).join('') || '<div class="ct-empty">Nothing here.</div>'}
      </div>
      <div class="muted fine">Click a rack to look at it. Condition is how far its hardware is from end of life: refurbish or fit a new CPU to reset it.</div>`;
  }

  private row(
    state: GameState, r: Building, condition: number, income: number, issues: string[], plan: { steps: unknown[]; cost: number },
  ): string {
    const def = buildingDef(r.kind);
    const slots = slotsOf(r);
    const fitted = slots.filter((s) => r.parts[s] !== undefined).length;
    const tone = condition > 0.5 ? 'good' : condition > 0.2 ? 'warn' : 'bad';
    let action = '';
    if (r.status === 'failed') {
      const cost = repairCost(r);
      action = `<button data-act="repair" data-id="${r.id}" ${state.cash < cost ? 'disabled' : ''}>Repair ${money(cost)}</button>`;
    } else if (r.status === 'ok') {
      const refurb = condition < 0.35 || ageFactor(state, r) < 0.9
        ? `<button data-act="refurbish" data-id="${r.id}" ${state.cash < refurbishCost(r) ? 'disabled' : ''}>Refurbish ${money(refurbishCost(r))}</button>`
        : '';
      const max = plan.steps.length
        ? `<button data-act="max" data-id="${r.id}" class="primary" title="${plan.steps.length} upgrade${plan.steps.length > 1 ? 's' : ''}">⏫ Max ${money(plan.cost)}</button>`
        : '<span class="muted rl-done">Max for now</span>';
      action = refurb + max;
    }
    return `
      <div class="rl-row" data-row="${r.id}">
        <div class="rl-name"><b>${def.name}</b><span class="muted">#${r.id} · tier ${rackTier(r)} · ${rackCores(r)} cores · ${fitted}/${slots.length} parts</span></div>
        <div class="rl-cond" title="Hardware condition ${Math.round(condition * 100)}%"><div class="rl-meter"><i class="${tone}" style="width:${Math.max(2, condition * 100)}%"></i></div><span>${Math.round(condition * 100)}%</span></div>
        <div class="rl-income">£${income.toFixed(2)}<small>/min</small></div>
        <div class="rl-issues">${issues.map((i) => `<span class="ct-pill bad">${i}</span>`).join('')}</div>
        <div class="rl-actions">${action}</div>
      </div>`;
  }
}
