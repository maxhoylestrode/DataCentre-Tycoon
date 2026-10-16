import { buildingDef, CONFIG, type PartSlot } from '../config';
import {
  type BuildingStats,
  buildingStats,
  installedPart,
  investedValue,
  nextPart,
  partContribution,
  partCost,
  slotsOf,
  upgradeCost,
} from '../sim/buildings';
import { SLOT_NAMES, TRADEMARK_NOTE } from '../sim/content/parts';
import type { Part } from '../sim/content/types';
import { repairCost } from '../sim/economy';
import { feedVents } from '../sim/floor';
import { isUnlocked, levelOf, unlockFor, upgradeCap } from '../sim/progression';
import { type Building, categoryOf, type GameState, tempAt } from '../sim/state';

export interface BuildingPanelHandlers {
  onUpgrade(buildingId: number): void;
  onUpgradePart(buildingId: number, slot: PartSlot): void;
  onSell(buildingId: number): void;
  onRepair(buildingId: number): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const perMin = (n: number): string => `£${n.toFixed(2)}/min`;

interface StatRow {
  label: string;
  value: (s: BuildingStats) => string;
}

// Which numbers matter for each kind of building.
const ROWS: Record<string, StatRow[]> = {
  rack: [
    { label: 'Income at full', value: (s) => perMin(s.income) },
    { label: 'Power draw', value: (s) => `${s.powerDraw.toFixed(1)} kW` },
    { label: 'Heat output', value: (s) => s.heat.toFixed(2) },
  ],
  power: [{ label: 'Power supply', value: (s) => `${s.powerSupply.toFixed(1)} kW` }],
  cooling: [
    { label: 'Cooling power', value: (s) => `${(s.coolingStrength * 100).toFixed(1)}` },
    { label: 'Area', value: (s) => `${s.coolingRadius * 2 + 1}×${s.coolingRadius * 2 + 1} tiles` },
    { label: 'Power draw', value: (s) => `${s.powerDraw.toFixed(1)} kW` },
  ],
  chiller: [{ label: 'Power draw', value: (s) => `${s.powerDraw.toFixed(1)} kW` }],
  decor: [{ label: 'Prestige', value: (s) => `+${s.prestige}` }],
};

// Details for the building you clicked: stats, upgrades (part slots for
// racks, levels for power and cooling), Repair and Sell.
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
      else if (act === 'part') handlers.onUpgradePart(id, button.dataset.slot as PartSlot);
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
    });
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
    const category = categoryOf(b);
    const isRack = slotsOf(b).length > 0;
    const levelled = !isRack && def.upgrade.output > 0;
    const max = CONFIG.upgrades.maxLevel;
    const now = buildingStats(b);
    const next = levelled && b.upgrade < max ? buildingStats(b, b.upgrade + 1) : null;

    const rows = (ROWS[category] ?? [])
      .map((r) => {
        const after = next && r.value(next) !== r.value(now) ? ` <span class="up">→ ${r.value(next)}</span>` : '';
        return `<tr><td>${r.label}</td><td>${r.value(now)}${after}</td></tr>`;
      })
      .join('');

    const statusText =
      b.status === 'failed' ? '<span class="bad">Failed</span>'
      : b.status === 'repairing' ? '<span class="muted">Under repair</span>'
      : '<span class="good">Working</span>';

    const levelLine = levelled
      ? ` <span class="muted">level ${b.upgrade} / ${max}</span>
         <div class="pips">${Array.from({ length: max }, (_, i) => `<span class="${i < b.upgrade ? 'on' : ''}"></span>`).join('')}</div>`
      : '';

    const extra = category === 'chiller' ? this.chillerInfo(state, b) : '';

    return `
      <h2>${def.name}${levelLine}</h2>
      <div>${statusText} &middot; <span class="muted">${tempAt(state, b.x, b.y).toFixed(1)}°C</span></div>
      <table>${rows}</table>
      ${extra}
      ${isRack ? this.partSlots(state, b) : ''}
      ${levelled ? this.upgradeButton(state, b, upgradeCap(state), b.upgrade >= max) : ''}
      ${b.status === 'failed' ? `<button data-act="repair" ${state.cash < repairCost(b) ? 'disabled' : ''}>Repair (${money(repairCost(b))})</button>` : ''}
      <button data-act="sell" class="danger">${this.confirmSell ? `Click again to sell for ${money(investedValue(b) * CONFIG.economy.sellRefund)}` : 'Sell'}</button>
      ${isRack ? `<div class="fine">${TRADEMARK_NOTE}</div>` : ''}`;
  }

  private chillerInfo(state: GameState, b: Building): string {
    const load = feedVents(state).load.get(b.id) ?? 0;
    const def = buildingDef(b.kind);
    return `<div class="muted">Feeding ${load} / ${def.chillerCapacity} floor vents within ${def.chillerRange} tiles.</div>`;
  }

  private partSlots(state: GameState, b: Building): string {
    const unlocked = isUnlocked(state, 'upgrades');
    const level = levelOf(state);
    const rows = slotsOf(b).map((slot) => {
      const part = installedPart(b, slot);
      const upcoming = nextPart(b, slot);
      return `
        <div class="slot">
          <div class="slot-head"><b>${SLOT_NAMES[slot]}</b> <span class="muted">${part ? this.partLabel(part) : ''}</span></div>
          ${part ? `<div class="muted">${part.specs}${this.partEffect(b, part)}</div>` : ''}
          ${this.partButton(state, b, slot, upcoming, unlocked, level)}
        </div>`;
    });
    return `<div class="slots">${rows.join('')}</div>`;
  }

  private partLabel(part: Part): string {
    return `${part.brand} ${part.model}`;
  }

  private partEffect(b: Building, part: Part): string {
    if (part.heatReduction) return '';
    const { income } = partContribution(b, part);
    return income > 0 ? ` &middot; <span class="good">+${perMin(income)}</span>` : '';
  }

  private partButton(state: GameState, b: Building, slot: PartSlot, part: Part | null, unlocked: boolean, level: number): string {
    if (!part) return '<div class="muted">Best part installed.</div>';
    const name = this.partLabel(part);
    if (!unlocked) return `<div class="muted">Upgrades unlock at level ${unlockFor('upgrades')?.level ?? '?'}.</div>`;
    if (part.level > level) return `<div class="muted">Next: ${name} at level ${part.level}</div>`;

    const cost = partCost(b, part);
    const current = installedPart(b, slot);
    const gain = part.heatReduction
      ? `-${Math.round(part.heatReduction * 100)}% rack heat`
      : `+${perMin(partContribution(b, part).income - (current ? partContribution(b, current).income : 0))}`;
    const reason = b.status !== 'ok' ? 'Repair it first.' : state.cash < cost ? `Need ${money(cost)}.` : '';
    return `
      <button data-act="part" data-slot="${slot}" class="primary" ${reason ? 'disabled' : ''}>
        → ${name} (${part.specs}) <b>${gain}</b> &middot; ${money(cost)}
      </button>`;
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
