import { buildingDef, CONFIG } from '../config';
import { type BuildingStats, buildingStats, investedValue, upgradeCost } from '../sim/buildings';
import { repairCost } from '../sim/economy';
import { isUnlocked, unlockFor, upgradeCap } from '../sim/progression';
import { type Building, categoryOf, type GameState, tempAt } from '../sim/state';

export interface BuildingPanelHandlers {
  onUpgrade(buildingId: number): void;
  onSell(buildingId: number): void;
  onRepair(buildingId: number): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

interface StatRow {
  label: string;
  value: (s: BuildingStats) => string;
}

// Which numbers matter for each kind of building.
const ROWS: Record<string, StatRow[]> = {
  rack: [
    { label: 'Income at full', value: (s) => `£${s.income.toFixed(2)} / min` },
    { label: 'Power draw', value: (s) => `${s.powerDraw.toFixed(1)} kW` },
    { label: 'Heat output', value: (s) => s.heat.toFixed(2) },
  ],
  power: [{ label: 'Power supply', value: (s) => `${s.powerSupply.toFixed(1)} kW` }],
  cooling: [
    { label: 'Cooling power', value: (s) => `${(s.coolingStrength * 100).toFixed(1)}` },
    { label: 'Area', value: (s) => `${s.coolingRadius * 2 + 1}×${s.coolingRadius * 2 + 1} tiles` },
    { label: 'Power draw', value: (s) => `${s.powerDraw.toFixed(1)} kW` },
  ],
};

// Details for the building you clicked: stats now and after the next
// upgrade, with Upgrade, Repair and Sell buttons.
export class BuildingPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private buildingId: number | null = null;
  private confirmSell = false;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: BuildingPanelHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'building-panel';
    this.root.innerHTML = `<button class="close" data-act="close">✕</button><div class="body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.body') as HTMLElement;

    // pointerdown, not click: the body re-renders as live numbers change, and a
    // button replaced between press and release would never get a click.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled || this.buildingId === null) return;
      const id = this.buildingId;
      const act = button.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'upgrade') handlers.onUpgrade(id);
      else if (act === 'repair') handlers.onRepair(id);
      else if (act === 'sell') {
        if (this.confirmSell) {
          handlers.onSell(id);
          this.close();
        } else {
          this.confirmSell = true;
        }
      }
      this.lastHtml = '';
      button.blur();
    });
  }

  get selectedId(): number | null {
    return this.buildingId;
  }

  show(buildingId: number): void {
    this.buildingId = buildingId;
    this.confirmSell = false;
    this.lastHtml = '';
    this.root.classList.add('open');
  }

  close(): void {
    this.buildingId = null;
    this.root.classList.remove('open');
  }

  // Returns the selected building (or null), closing the panel if it's gone.
  update(state: GameState): Building | null {
    if (this.buildingId === null) return null;
    const building = state.buildings.find((b) => b.id === this.buildingId);
    if (!building) {
      this.close();
      return null;
    }
    const html = this.render(state, building);
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
    return building;
  }

  private render(state: GameState, b: Building): string {
    const def = buildingDef(b.kind);
    const max = CONFIG.upgrades.maxLevel;
    const cap = upgradeCap(state);
    const atMax = b.upgrade >= max;
    const now = buildingStats(b);
    const next = atMax ? null : buildingStats(b, b.upgrade + 1);

    const rows = (ROWS[categoryOf(b)] ?? [])
      .map((r) => {
        const after = next && r.value(next) !== r.value(now) ? ` <span class="up">→ ${r.value(next)}</span>` : '';
        return `<tr><td>${r.label}</td><td>${r.value(now)}${after}</td></tr>`;
      })
      .join('');

    const statusText =
      b.status === 'failed' ? '<span class="bad">Failed</span>'
      : b.status === 'repairing' ? '<span class="muted">Under repair</span>'
      : '<span class="good">Working</span>';

    return `
      <h2>${def.name} <span class="muted">level ${b.upgrade} / ${max}</span></h2>
      <div class="pips">${Array.from({ length: max }, (_, i) => `<span class="${i < b.upgrade ? 'on' : ''}"></span>`).join('')}</div>
      <div>${statusText} &middot; <span class="muted">${tempAt(state, b.x, b.y).toFixed(1)}°C</span></div>
      <table>${rows}</table>
      ${this.upgradeButton(state, b, cap, atMax)}
      ${b.status === 'failed' ? `<button data-act="repair" ${state.cash < repairCost(b) ? 'disabled' : ''}>Repair (${money(repairCost(b))})</button>` : ''}
      <button data-act="sell" class="danger">${this.confirmSell ? `Click again to sell for ${money(investedValue(b) * CONFIG.economy.sellRefund)}` : 'Sell'}</button>`;
  }

  private upgradeButton(state: GameState, b: Building, cap: number, atMax: boolean): string {
    if (atMax) return '<div class="muted">Fully upgraded.</div>';
    if (!isUnlocked(state, 'upgrades')) {
      return `<div class="muted">Upgrades unlock at level ${unlockFor('upgrades')?.level ?? '?'}.</div>`;
    }
    const cost = upgradeCost(b);
    let reason = '';
    if (b.upgrade >= cap) reason = `Reach level ${b.upgrade + 1} to upgrade further.`;
    else if (b.status !== 'ok') reason = 'Repair it first.';
    else if (state.cash < cost) reason = `Need ${money(cost)}.`;
    return `
      <button data-act="upgrade" class="primary" ${reason ? 'disabled' : ''}>Upgrade to level ${b.upgrade + 1} (${money(cost)})</button>
      ${reason ? `<div class="muted">${reason}</div>` : ''}`;
  }
}
