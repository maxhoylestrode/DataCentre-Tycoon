import { CONFIG } from '../config';
import { RESEARCH } from '../sim/content/research';
import type { ResearchEffectKind, ResearchProject } from '../sim/content/types';
import { canSellCompany, companyValue, legacyPointsFor } from '../sim/legacy';
import { isUnlocked, levelOf, unlockFor } from '../sim/progression';
import { researchProject, researchStatus, researchTicks } from '../sim/research';
import type { GameState } from '../sim/state';
import { ICONS } from './icons';

export interface ResearchHandlers {
  onStart(id: string): void;
  onSellCompany(): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

const EFFECT_TEXT: Record<ResearchEffectKind, (v: number) => string> = {
  powerOutput: (v) => `+${pct(v)} power`,
  coolingStrength: (v) => `+${pct(v)} cooling`,
  electricityDiscount: (v) => `-${pct(v)} electricity bill`,
  contractPay: (v) => `+${pct(v)} contract pay`,
  walkInIncome: (v) => `+${pct(v)} walk-in income`,
  marketRacks: (v) => `+${v} racks before the market fills`,
  staffSpeed: (v) => `+${pct(v)} staff speed`,
  ageingSlower: (v) => `${pct(v)} slower ageing`,
  bandwidthSaving: (v) => `-${pct(v)} bandwidth used`,
  eventChance: (v) => `-${pct(v)} incidents`,
  upkeepDiscount: (v) => `-${pct(v)} upkeep`,
};
const pct = (v: number): string => `${Math.round(v * 100)}%`;

export const effectsText = (p: ResearchProject): string => p.effects.map((e) => EFFECT_TEXT[e.kind](e.value)).join(' · ');

// The research tree, plus selling the company for legacy points.
export class ResearchPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastHtml = '';
  private confirmSell = false;

  constructor(parent: HTMLElement, handlers: ResearchHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel research-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.research}<h2>Research</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      const act = button.dataset.act;
      if (act === 'close') this.toggle(false);
      else if (act === 'start' && button.dataset.id) handlers.onStart(button.dataset.id);
      else if (act === 'sell') {
        if (this.confirmSell) {
          this.confirmSell = false;
          handlers.onSellCompany();
        } else this.confirmSell = true;
      }
      if (act !== 'sell') this.confirmSell = false;
      this.lastHtml = '';
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.confirmSell = false;
    this.lastHtml = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    if (!isUnlocked(state, 'research')) {
      this.render(`<p class="muted">Research unlocks at level ${unlockFor('research')?.level ?? '?'}.</p>`);
      return;
    }
    const level = levelOf(state);
    const current = state.research.current;
    const running = current ? researchProject(current.id) : undefined;
    const head = running
      ? (() => {
          const total = researchTicks(running);
          const done = Math.round(((total - current!.remaining) / total) * 100);
          const hoursLeft = Math.ceil(current!.remaining / 60);
          return `<div class="ct-meter"><div class="ct-meter-label"><span>Researching</span><b>${running.name}</b><span class="muted">${hoursLeft}h left</span></div>
            <div class="ct-bar"><div class="ct-fill good" style="width:${done}%"></div></div></div>`;
        })()
      : '<p class="muted">Pick a project. It is paid for now and finishes after its game days. One at a time.</p>';

    const cards = RESEARCH.map((p) => {
      const status = researchStatus(state, p, level);
      let action: string;
      if (status === 'done') action = '<span class="ct-pill good">Done</span>';
      else if (status === 'running') action = '<span class="ct-pill time">Running</span>';
      else if (status === 'locked_level') action = `<span class="muted">Level ${p.level}</span>`;
      else if (status === 'locked_requires') {
        const need = p.requires.map((r) => researchProject(r)?.name ?? r).join(', ');
        action = `<span class="muted">Needs ${need}</span>`;
      } else {
        const reason = current ? 'Busy' : state.cash < p.cost ? `Need ${money(p.cost)}` : '';
        action = `<button data-act="start" data-id="${p.id}" class="primary" ${reason ? 'disabled' : ''}>${reason || `Start · ${money(p.cost)}`}</button>`;
      }
      return `<div class="rs-card ${status}">
          <div class="rs-top"><b>${p.name}</b><span class="muted">${p.days}d · ${money(p.cost)}</span></div>
          <div class="rs-effect">${effectsText(p)}</div>
          <div class="muted rs-desc">${p.description}</div>
          <div class="rs-action">${action}</div>
        </div>`;
    });

    const value = companyValue(state);
    const points = legacyPointsFor(state);
    const can = canSellCompany(state);
    const L = CONFIG.legacy;
    const legacyNow = state.legacy.points
      ? `<p>Legacy: <b>${state.legacy.points} points</b> from ${state.legacy.sales} sale${state.legacy.sales === 1 ? '' : 's'}: +${Math.round(state.legacy.points * L.incomePerPoint * 100)}% income, +${money(state.legacy.points * L.startingCashPerPoint)} starting cash.</p>`
      : '';
    const sell = `
      <h3>Sell the company</h3>
      ${legacyNow}
      <p class="muted">Sell up and start again with a permanent bonus. Each legacy point gives +${Math.round(L.incomePerPoint * 100)}% income and +${money(L.startingCashPerPoint)} starting cash in every future game. Everything else resets.</p>
      <div class="ct-hist"><span>Company value</span><b>${money(value)}</b><span>Legacy points</span><b>+${points}</b>
        <button data-act="sell" class="danger" ${can ? '' : 'disabled'}>${
          !can
            ? level < L.minLevel ? `Level ${L.minLevel} to sell` : 'Not worth enough yet'
            : this.confirmSell ? `Click again: sell for ${points} points` : 'Sell company'
        }</button></div>`;

    this.render(`${head}<div class="rs-grid">${cards.join('')}</div>${sell}`);
  }

  private render(html: string): void {
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }
}
