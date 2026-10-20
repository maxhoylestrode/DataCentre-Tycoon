import { buildingDef, CONFIG } from '../config';
import { buildingStats, investedValue, refurbishCost } from '../sim/buildings';
import { planUpgradeMax } from '../sim/commands';
import { repairCost } from '../sim/economy';
import { isWorn } from '../sim/pressure';
import { type Building, categoryOf, type GameState } from '../sim/state';
import { kw } from './format';
import { ICONS, itemIcon } from './icons';

export interface SelectionHandlers {
  onDetails(id: number): void;
  onUpgrade(ids: number[]): void;
  onRepair(ids: number[]): void;
  onRefurbish(ids: number[]): void;
  onRotate(ids: number[]): void;
  onMove(ids: number[]): void;
  onSell(ids: number[]): void;
  // Taps add to and remove from the selection (touch has no Shift).
  onToggleMulti(): void;
  onClear(): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

// The bar shown while buildings are selected with the Select tool: what's
// in the selection, and actions for all of it at once.
export class SelectionBar {
  private readonly root: HTMLElement;
  private ids: number[] = [];
  private confirmSell = false;
  private lastHtml = '';
  // Upgrade plans for big selections are costly: refresh a few times a second.
  private lastAt = 0;
  private multi = false;

  constructor(parent: HTMLElement, handlers: SelectionHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'selection-bar';
    parent.appendChild(this.root);
    // pointerdown: the bar re-renders as numbers change (see BuildingPanel).
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      const ids = [...this.ids];
      const act = button.dataset.act;
      if (act !== 'sell') this.confirmSell = false;
      if (act === 'clear') handlers.onClear();
      else if (act === 'details') handlers.onDetails(ids[0]!);
      else if (act === 'upgrade') handlers.onUpgrade(ids);
      else if (act === 'repair') handlers.onRepair(ids);
      else if (act === 'refurbish') handlers.onRefurbish(ids);
      else if (act === 'rotate') handlers.onRotate(ids);
      else if (act === 'move') handlers.onMove(ids);
      else if (act === 'multi') handlers.onToggleMulti();
      else if (act === 'sell') {
        if (this.confirmSell) {
          this.confirmSell = false;
          handlers.onSell(ids);
        } else this.confirmSell = true;
      }
      this.lastHtml = '';
    });
  }

  update(state: GameState, ids: number[], multi = false): void {
    const changed = ids.join(',') !== this.ids.join(',') || multi !== this.multi;
    this.multi = multi;
    if (changed) this.confirmSell = false;
    const now = performance.now();
    if (!changed && this.lastHtml && now - this.lastAt < 250) return;
    this.lastAt = now;
    this.ids = ids;
    const selected = state.buildings.filter((b) => ids.includes(b.id));
    if (selected.length === 0) {
      this.root.classList.remove('open');
      this.lastHtml = '';
      return;
    }
    this.root.classList.add('open');
    const html = this.render(state, selected);
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.root.innerHTML = html;
    }
  }

  private render(state: GameState, selected: Building[]): string {
    // What's selected, by kind.
    const kinds = new Map<string, number>();
    for (const b of selected) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
    const chips = [...kinds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kind, n]) => `<span class="sel-chip">${itemIcon(kind)}${n > 1 ? `${n}× ` : ''}${buildingDef(kind as Building['kind']).name}</span>`);
    if (kinds.size > 6) chips.push(`<span class="sel-chip">+${kinds.size - 6} more</span>`);

    const racks = selected.filter((b) => categoryOf(b) === 'rack');
    const failed = racks.filter((b) => b.status === 'failed');
    const worn = racks.filter((b) => isWorn(state, b));
    const income = racks.reduce((s, b) => s + buildingStats(b).income, 0);
    const draw = selected.reduce((s, b) => s + buildingStats(b).powerDraw, 0);
    const upgrade = selected.reduce((s, b) => s + (b.status === 'ok' ? planUpgradeMax(state, b.x, b.y).cost : 0), 0);
    const repair = failed.reduce((s, b) => s + repairCost(b), 0);
    const refurbish = worn.reduce((s, b) => s + refurbishCost(b), 0);
    const refund = selected.reduce((s, b) => s + investedValue(b) * CONFIG.economy.sellRefund, 0);

    const facts = [
      racks.length ? `<span>${racks.length} rack${racks.length > 1 ? 's' : ''} · £${income.toFixed(1)}/min at full</span>` : '',
      draw > 0 ? `<span>${kw(draw)} draw</span>` : '',
      failed.length ? `<span class="bad">${failed.length} failed</span>` : '',
      worn.length ? `<span class="warn">${worn.length} worn</span>` : '',
    ].filter(Boolean);

    const btn = (act: string, label: string, enabled = true, cls = ''): string =>
      `<button data-act="${act}" class="${cls}" ${enabled ? '' : 'disabled'}>${label}</button>`;
    const n = selected.length;
    return `
      <div class="sel-head">
        <span class="sel-icon">${ICONS.select}</span>
        <b>${n} selected</b>
        <span class="muted sel-hint">Shift+click to add or remove · drag a box · Esc clears</span>
        <button data-act="clear" class="sel-close" aria-label="Clear selection">✕</button>
      </div>
      <div class="sel-chips">${chips.join('')}</div>
      ${facts.length ? `<div class="sel-facts">${facts.join('')}</div>` : ''}
      <div class="sel-actions">
        ${n === 1 ? btn('details', 'Details') : ''}
        ${btn('upgrade', upgrade > 0 ? `Upgrade max · ${money(upgrade)}` : 'Upgrade max', upgrade > 0 && state.cash > 0, 'primary')}
        ${failed.length ? btn('repair', `Repair ${failed.length} · ${money(repair)}`, state.cash >= Math.min(...failed.map(repairCost))) : ''}
        ${worn.length ? btn('refurbish', `Refurbish ${worn.length} · ${money(refurbish)}`, state.cash >= Math.min(...worn.map(refurbishCost))) : ''}
        ${btn('multi', this.multi ? '✓ Add mode' : '+ Add mode', true, this.multi ? 'on' : '')}
        ${btn('rotate', 'Rotate')}
        ${btn('move', 'Move')}
        ${btn('sell', this.confirmSell ? `Click again: sell ${n} for +${money(refund)}` : `Sell · +${money(refund)}`, true, 'danger')}
      </div>`;
  }
}
