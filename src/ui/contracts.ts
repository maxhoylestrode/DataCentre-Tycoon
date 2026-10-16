import { BUILDING_KINDS, buildingDef, CONFIG } from '../config';
import { CUSTOMER_TYPES } from '../sim/content/customers';
import type { ContractRequirement } from '../sim/content/types';
import { canTakeOffer, committedRacks, freeRacks, qualifyingRacks, uptimeOf } from '../sim/contracts';
import { incomeBreakdown } from '../sim/economy';
import { type Contract, type ContractTerms, type GameState, isRunning, racksOf } from '../sim/state';
import { ICONS } from './icons';

export interface ContractsHandlers {
  onSign(offerId: number): void;
  onCancel(contractId: number): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const pct = (n: number): string => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function customerType(id: string) {
  return CUSTOMER_TYPES.find((t) => t.id === id);
}

// Initials for the coloured avatar: "Pixel Games" -> "PG", "Pixelly" -> "PI".
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

// Rack model name for a tier, e.g. 2 -> "Performance rack".
function tierName(tier: number): string {
  const kind = BUILDING_KINDS.find((k) => buildingDef(k).category === 'rack' && buildingDef(k).tier === tier);
  return kind ? buildingDef(kind).name : `Tier ${tier} rack`;
}

function requirementLabels(req: ContractRequirement): string[] {
  const labels: string[] = [];
  if (req.minRackTier !== undefined && req.minRackTier > 1) labels.push(`${tierName(req.minRackTier)} or better`);
  if (req.minCores !== undefined) labels.push(`${req.minCores}+ CPU cores per rack`);
  if (req.gpu) labels.push('GPU compute rack');
  return labels;
}

const tile = (label: string, value: string, cls = ''): string =>
  `<div class="ct-tile ${cls}"><div class="ct-tile-value">${value}</div><div class="ct-tile-label">${label}</div></div>`;

// The contract board and active contracts, opened from the toolbar (K).
export class ContractsPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private confirmCancelId: number | null = null;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: ContractsHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.contracts}<h2>Contracts</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;

    // One listener for every button, since the body is re-rendered. pointerdown,
    // not click: a button replaced between press and release would miss a click.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
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
      }
      this.lastHtml = '';
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
    const html = [this.summary(state), this.activeList(state), this.offerList(state), this.history(state)].join('');
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.body.innerHTML = html;
  }

  private summary(state: GameState): string {
    const racks = racksOf(state);
    const working = racks.filter(isRunning).length;
    const promised = committedRacks(state);
    const short = working < promised;
    const income = incomeBreakdown(state).contracts;
    return `
      <div class="ct-tiles">
        ${tile('Racks owned', String(racks.length))}
        ${tile('Working', String(working), short ? 'bad' : '')}
        ${tile('Promised', String(promised))}
        ${tile('Free', String(freeRacks(state)), 'accent')}
        ${tile('Contract income', `£${income.toFixed(2)}<small>/min</small>`, 'good')}
      </div>
      ${short ? '<div class="ct-alert">Not enough working racks for your contracts: uptime is dropping.</div>' : ''}`;
  }

  // Customer avatar, name, type chip and headline pay.
  private cardHead(t: ContractTerms): string {
    const type = customerType(t.customerType);
    const color = hex(type?.color ?? 0x8a94a3);
    return `
      <div class="ct-card-head">
        <div class="ct-avatar" style="background:${color}">${initials(t.name)}</div>
        <div class="ct-who"><b>${t.name}</b><span class="ct-chip" style="color:${color};border-color:${color}55;background:${color}1f">${type?.name ?? 'Customer'}</span></div>
        <div class="ct-pay"><b>£${(t.payPerRackPerTick * t.racks).toFixed(2)}</b><small>/min</small></div>
      </div>`;
  }

  private terms(t: ContractTerms): string {
    return `
      <div class="ct-stats">
        ${tile('Racks', String(t.racks))}
        ${tile('Length', `${t.days} day${t.days > 1 ? 's' : ''}`)}
        ${tile('Uptime promise', pct(t.sla))}
        ${tile('Per rack', `£${t.payPerRackPerTick.toFixed(2)}`)}
      </div>
      <div class="ct-rewards">
        <span class="ct-pill good">Bonus ${money(t.bonus)} + ${t.xp} XP</span>
        <span class="ct-pill bad">Penalty ${money(t.penalty)}</span>
      </div>`;
  }

  private requirements(state: GameState, t: ContractTerms): string {
    if (!t.requirement) return '';
    const have = qualifyingRacks(state, t.requirement);
    const met = have >= t.racks;
    const badges = requirementLabels(t.requirement).map((l) => `<span class="ct-req ${met ? 'met' : ''}">${met ? '✓' : '✕'} ${l}</span>`);
    return `<div class="ct-reqs">${badges.join('')}<span class="ct-req-count ${met ? 'good' : 'bad'}">You have ${have} suitable rack${have === 1 ? '' : 's'}</span></div>`;
  }

  private activeList(state: GameState): string {
    const active = state.contracts.active;
    const head = `<h3>Active <span class="ct-count">${active.length}</span></h3>`;
    if (active.length === 0) return `${head}<div class="ct-empty">No contracts yet. Sign one below.</div>`;
    return head + active.map((c) => this.activeCard(state, c)).join('');
  }

  private activeCard(state: GameState, c: Contract): string {
    const type = customerType(c.customerType);
    const uptime = uptimeOf(c);
    const ok = uptime >= c.sla;
    const total = c.endTick - c.startTick;
    const elapsed = Math.min(1, Math.max(0, (state.tick - c.startTick) / total));
    const daysLeft = Math.max(0, (c.endTick - state.tick) / CONFIG.time.ticksPerDay);
    const confirming = this.confirmCancelId === c.id;
    // The bar shows 80%–100% so a few points of uptime are easy to see.
    const scale = (v: number): number => Math.max(0, Math.min(100, ((v - 0.8) / 0.2) * 100));
    return `
      <div class="ct-card" style="--ct-color:${hex(type?.color ?? 0x8a94a3)}">
        ${this.cardHead(c)}
        ${this.requirements(state, c)}
        <div class="ct-meter">
          <div class="ct-meter-label"><span>Uptime</span><b class="${ok ? 'good' : 'bad'}">${pct(uptime)}</b><span class="muted">promised ${pct(c.sla)}</span></div>
          <div class="ct-bar"><div class="ct-fill ${ok ? 'good' : 'bad'}" style="width:${scale(uptime)}%"></div><div class="ct-mark" style="left:${scale(c.sla)}%"></div></div>
        </div>
        <div class="ct-meter">
          <div class="ct-meter-label"><span>Time</span><b>${daysLeft.toFixed(1)} days left</b><span class="muted">of ${c.days}</span></div>
          <div class="ct-bar"><div class="ct-fill time" style="width:${elapsed * 100}%"></div></div>
        </div>
        <div class="ct-rewards">
          <span class="ct-pill good">Bonus ${money(c.bonus)} + ${c.xp} XP</span>
          <span class="ct-pill bad">Penalty ${money(c.penalty)}</span>
          <button data-act="cancel" data-id="${c.id}" class="danger ct-cancel">${confirming ? `Click again to pay ${money(c.penalty)}` : 'Cancel'}</button>
        </div>
      </div>`;
  }

  private offerList(state: GameState): string {
    const offers = state.contracts.offers;
    const cards = offers.map((o) => {
      const type = customerType(o.customerType);
      const canSign = !state.bankrupt && canTakeOffer(state, o);
      const why = o.requirement ? 'Not enough suitable racks free' : `Needs ${o.racks} free rack${o.racks > 1 ? 's' : ''}`;
      return `
        <div class="ct-card offer" style="--ct-color:${hex(type?.color ?? 0x8a94a3)}">
          ${this.cardHead(o)}
          ${this.terms(o)}
          ${this.requirements(state, o)}
          <button data-act="sign" data-id="${o.id}" class="primary ct-sign" ${canSign ? '' : 'disabled'}>${canSign ? 'Sign contract' : why}</button>
        </div>`;
    });
    return (
      `<h3>Offers <span class="ct-count">${offers.length}</span><span class="muted ct-note">new offers every morning</span></h3>` +
      (cards.length ? `<div class="ct-grid">${cards.join('')}</div>` : '<div class="ct-empty">No offers left today.</div>')
    );
  }

  private history(state: GameState): string {
    const recent = state.contracts.history.slice(-4).reverse();
    if (recent.length === 0) return '';
    const label = { completed: 'Kept', failed: 'Broken', cancelled: 'Cancelled' } as const;
    const rows = recent.map(
      (h) => `
        <div class="ct-hist">
          <span class="ct-pill ${h.outcome === 'completed' ? 'good' : 'bad'}">${label[h.outcome]}</span>
          <b>${h.name}</b>
          <span class="muted">${pct(h.uptime)} uptime</span>
          <span class="${h.cash >= 0 ? 'good' : 'bad'}">${h.cash >= 0 ? '+' : '-'}${money(Math.abs(h.cash))}</span>
        </div>`,
    );
    return `<h3>Recent</h3>${rows.join('')}`;
  }
}
