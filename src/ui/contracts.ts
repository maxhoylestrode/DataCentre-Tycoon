import { CONFIG } from '../config';
import { CUSTOMER_TYPES } from '../sim/content/customers';
import { committedRacks, freeRacks, uptimeOf } from '../sim/contracts';
import { type Contract, type ContractTerms, type GameState, isRunning, racksOf } from '../sim/state';

export interface ContractsHandlers {
  onSign(offerId: number): void;
  onCancel(contractId: number): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const pct = (n: number): string => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;

function typeName(id: string): string {
  return CUSTOMER_TYPES.find((t) => t.id === id)?.name ?? 'Customer';
}

function terms(t: ContractTerms): string {
  return `
    <div class="terms">
      ${t.racks} rack${t.racks > 1 ? 's' : ''} &middot; ${t.days} day${t.days > 1 ? 's' : ''} &middot;
      <b>£${(t.payPerRackPerTick * t.racks).toFixed(2)} / min</b> &middot; uptime promise <b>${pct(t.sla)}</b>
    </div>
    <div class="muted">Bonus ${money(t.bonus)} + ${t.xp} XP if kept &middot; penalty ${money(t.penalty)} if broken</div>`;
}

// The contract board and active contracts, opened from the toolbar (K).
export class ContractsPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private confirmCancelId: number | null = null;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: ContractsHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts';
    this.root.innerHTML = `
      <div class="contracts-head"><h2>Contracts</h2><button data-act="close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;

    // One listener for every button, since the body is re-rendered.
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      const id = Number(button.dataset.id);
      const act = button.dataset.act;
      if (act === 'close') this.toggle(false);
      else if (act === 'sign') handlers.onSign(id);
      else if (act === 'cancel') {
        if (this.confirmCancelId === id) {
          handlers.onCancel(id);
          this.confirmCancelId = null;
        } else {
          this.confirmCancelId = id;
        }
        this.lastHtml = '';
      }
      button.blur();
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.confirmCancelId = null;
    this.lastHtml = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    const html = [this.capacity(state), this.activeList(state), this.offerList(state), this.history(state)].join('');
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.body.innerHTML = html;
  }

  private capacity(state: GameState): string {
    const racks = racksOf(state);
    const working = racks.filter(isRunning).length;
    const promised = committedRacks(state);
    const short = working < promised;
    return `
      <div class="capacity ${short ? 'bad' : ''}">
        Racks: ${racks.length} owned &middot; ${working} working &middot; ${promised} promised &middot;
        <b>${freeRacks(state)} free</b>
        ${short ? '<br>Not enough working racks for your contracts: uptime is dropping.' : ''}
      </div>`;
  }

  private activeList(state: GameState): string {
    const active = state.contracts.active;
    if (active.length === 0) return '<h3>Active</h3><div class="muted">No contracts yet. Sign one below.</div>';
    return '<h3>Active</h3>' + active.map((c) => this.activeRow(state, c)).join('');
  }

  private activeRow(state: GameState, c: Contract): string {
    const uptime = uptimeOf(c);
    const daysLeft = Math.max(0, (c.endTick - state.tick) / CONFIG.time.ticksPerDay);
    const ok = uptime >= c.sla;
    const confirming = this.confirmCancelId === c.id;
    return `
      <div class="contract">
        <div class="row-top"><b>${c.name}</b> <span class="muted">${typeName(c.customerType)}</span></div>
        ${terms(c)}
        <div>Uptime <b class="${ok ? 'good' : 'bad'}">${pct(uptime)}</b> of ${pct(c.sla)} promised &middot; ${daysLeft.toFixed(1)} days left</div>
        <button data-act="cancel" data-id="${c.id}" class="danger">${confirming ? `Click again: pay ${money(c.penalty)} to cancel` : 'Cancel'}</button>
      </div>`;
  }

  private offerList(state: GameState): string {
    const offers = state.contracts.offers;
    const free = freeRacks(state);
    const rows = offers.map((o) => {
      const canSign = free >= o.racks && !state.bankrupt;
      const why = canSign ? '' : `<span class="muted">Needs ${o.racks} free rack${o.racks > 1 ? 's' : ''}</span>`;
      return `
        <div class="contract offer">
          <div class="row-top"><b>${o.name}</b> <span class="muted">${typeName(o.customerType)}</span></div>
          ${terms(o)}
          <button data-act="sign" data-id="${o.id}" ${canSign ? '' : 'disabled'}>Sign</button> ${why}
        </div>`;
    });
    return (
      '<h3>Offers <span class="muted">(new offers every morning)</span></h3>' +
      (rows.length ? rows.join('') : '<div class="muted">No offers left today.</div>')
    );
  }

  private history(state: GameState): string {
    const recent = state.contracts.history.slice(-3).reverse();
    if (recent.length === 0) return '';
    const rows = recent.map(
      (h) =>
        `<div class="muted">${h.name}: ${h.outcome} at ${pct(h.uptime)} uptime, ${h.cash >= 0 ? '+' : '-'}${money(Math.abs(h.cash))}</div>`,
    );
    return '<h3>Recent</h3>' + rows.join('');
  }
}
