import { ROOM_STYLES } from '../sim/content/styles';
import type { RoomStyle } from '../sim/content/types';
import { buildingDef, type BuildingKind } from '../config';
import { DECOR_SETS } from '../sim/content/decorSets';
import { decorSetProgress, prestigeExtraOffers, prestigeOf, prestigePayBonus } from '../sim/prestige';
import { levelOf } from '../sim/progression';
import type { GameState } from '../sim/state';

export interface StyleHandlers {
  onChoose(styleId: string): void;
}

const SLOTS: { id: RoomStyle['slot']; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'wall', label: 'Walls' },
  { id: 'lighting', label: 'Lighting' },
];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

// Room styles and the prestige they bring, opened from the toolbar (L).
export class StylePanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: StyleHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts style-panel';
    this.root.innerHTML = `
      <div class="contracts-head"><h2>Style</h2><button data-act="close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;

    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.style) handlers.onChoose(button.dataset.style);
      this.lastHtml = '';
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.lastHtml = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    const prestige = prestigeOf(state);
    const level = levelOf(state);
    const sections = SLOTS.map(({ id, label }) => {
      const options = ROOM_STYLES.filter((s) => s.slot === id).map((s) => {
        const active = state.style[id] === s.id;
        const owned = state.style.owned.includes(s.id);
        const locked = s.level > level;
        const action = active ? 'In use' : owned ? 'Use' : locked ? `Level ${s.level}` : `Buy £${s.cost.toLocaleString('en-GB')}`;
        const disabled = active || locked || (!owned && state.cash < s.cost);
        return `
          <div class="style-option ${active ? 'active' : ''}">
            <span class="swatch" style="background:${hex(s.color)}${s.accent !== undefined ? `;box-shadow:0 0 0 3px ${hex(s.accent)}` : ''}"></span>
            <span class="style-name">${s.name}<br><span class="muted">+${s.prestige} prestige</span></span>
            <button data-style="${s.id}" ${disabled ? 'disabled' : ''}>${action}</button>
          </div>`;
      });
      return `<h3>${label}</h3>${options.join('')}`;
    });
    const extra = prestigeExtraOffers(state);
    const html = `
      <div class="capacity">Prestige <b>${prestige}</b> &middot; contracts pay +${Math.round(prestigePayBonus(state) * 100)}%${extra ? ` &middot; +${extra} offer${extra > 1 ? 's' : ''} a day` : ''}
        <br><span class="muted">Decorations (Decor menu), finished decor sets and the styles in use all add prestige.</span></div>
      ${sections.join('')}
      <h3>Decor sets</h3>
      <p class="muted">Build one of each item in a set, anywhere you own, for bonus prestige.</p>
      ${this.sets(state)}`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }

  private sets(state: GameState): string {
    return DECOR_SETS.map((set) => {
      const { have, missing } = decorSetProgress(state, set);
      const done = missing.length === 0;
      const items = set.items
        .map((id) => `<span class="${have.includes(id) ? 'good' : 'muted'}">${have.includes(id) ? '✓' : '·'} ${buildingDef(id as BuildingKind).name}</span>`)
        .join('');
      return `
        <div class="decor-set ${done ? 'done' : ''}">
          <div class="rs-top"><b>${set.name}</b><span class="${done ? 'good' : 'muted'}">${done ? 'Complete · ' : `${have.length}/${set.items.length} · `}+${set.prestige} prestige</span></div>
          <div class="decor-set-items">${items}</div>
        </div>`;
    }).join('');
  }
}
