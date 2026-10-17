import { UPLINKS } from '../sim/content/uplinks';
import { bandwidthDemand, formatMbps, networkEfficiency, uplinkOf } from '../sim/network';
import { levelOf } from '../sim/progression';
import type { GameState } from '../sim/state';
import { ICONS } from './icons';

export interface NetworkHandlers {
  onUpgrade(): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

// The internet line ladder: current speed, demand, and the next upgrades.
export class NetworkPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: NetworkHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel network-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.network}<h2>Internet line</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.act === 'upgrade') handlers.onUpgrade();
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
    const line = uplinkOf(state);
    const demand = bandwidthDemand(state);
    const eff = networkEfficiency(state);
    const level = levelOf(state);
    const current = UPLINKS.indexOf(line);
    const rows = UPLINKS.map((u, i) => {
      let action = '';
      if (i < current) action = '<span class="muted">Had</span>';
      else if (i === current) action = '<span class="ct-pill good">Current</span>';
      else if (i === current + 1) {
        const reason = u.level > level ? `Level ${u.level}` : state.cash < u.cost ? `Need ${money(u.cost)}` : '';
        action = `<button data-act="upgrade" class="primary" ${reason ? 'disabled' : ''}>${reason || `Upgrade · ${money(u.cost)}`}</button>`;
      } else action = `<span class="muted">Level ${u.level}</span>`;
      return `<div class="ct-hist ${i === current ? 'net-current' : ''}"><b>${formatMbps(u.mbps)}</b><span>${u.name}</span><span class="muted">£${u.rentalPerTick.toFixed(2)}/min</span>${action}</div>`;
    });
    const pct = Math.min(100, (demand / line.mbps) * 100);
    const html = `
      <div class="ct-meter">
        <div class="ct-meter-label"><span>Bandwidth</span><b class="${eff < 1 ? 'bad' : 'good'}">${formatMbps(demand)}</b><span class="muted">of ${formatMbps(line.mbps)}</span></div>
        <div class="ct-bar"><div class="ct-fill ${eff < 1 ? 'bad' : pct > 85 ? 'time' : 'good'}" style="width:${pct}%"></div></div>
      </div>
      ${eff < 1 ? `<div class="ct-alert">Your line is full: everything runs at ${Math.floor(eff * 100)}% and contracts lose uptime. Upgrade the line.</div>` : ''}
      <p class="muted">Racks use bandwidth in step with what they earn, so every upgrade needs a bit more line. Over the limit, racks slow down like in a power cut.</p>
      ${rows.join('')}`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }
}
