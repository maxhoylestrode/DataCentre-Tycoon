import { buildingDef, CONFIG, type StaffRole } from '../config';
import { buildTicks, isOverdue } from '../sim/buildings';
import { wagesPerTick } from '../sim/economy';
import { receptionDesks, staffSpeedFactor } from '../sim/people';
import { isUnlocked, unlockFor } from '../sim/progression';
import { salesExtraOffers, salesPayBonus } from '../sim/sales';
import {
  hireFeeOf,
  hirableRoles,
  isAway,
  SPECIALISMS,
  specialismsFor,
  TRAITS,
  trainingCost,
  wageOf,
  workSpeedOf,
} from '../sim/staff';
import { type Candidate, categoryOf, type GameState, type Specialism, type StaffMember } from '../sim/state';
import { hasStorage, staffCapacity } from '../sim/zones';
import { clockText } from './format';
import { ICONS } from './icons';

export interface StaffHandlers {
  onHire(candidateId: number): void;
  onFire(staffId: number): void;
  onTrain(staffId: number, specialism?: Specialism): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const S = CONFIG.staff.sales;
const G = CONFIG.staffGrowth;
const MAX_LEVEL = G.levelJobs.length;
const tile = (label: string, value: string, cls = ''): string =>
  `<div class="ct-tile ${cls}"><div class="ct-tile-value">${value}</div><div class="ct-tile-label">${label}</div></div>`;

const ROLE_INFO: Record<StaffRole, { blurb: string; colour: string }> = {
  engineer: { blurb: 'Builds everything you place and repairs failed racks.', colour: '#ffb347' },
  technician: { blurb: `Services racks every ${CONFIG.maintenance.intervalTicks / CONFIG.time.ticksPerDay} days so they keep full income.`, colour: '#4aa8ff' },
  account_manager: {
    blurb: 'Staffs a reception desk and signs good contracts for you: only ones you have racks for, can keep the uptime promise on, and that raise your income.',
    colour: '#3fd0c9',
  },
  sales_rep: {
    blurb: `Finds new clients: +${S.offersPerRep} contract offer a day and about +${S.payPerRep * 100}% pay on new offers each (up to +${S.maxExtraOffers} offers, +${S.maxPayBonus * 100}% pay).`,
    colour: '#c58cff',
  },
};

const pips = (level: number): string =>
  `<span class="sf-pips" title="Level ${level} of ${MAX_LEVEL}">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span>`;

const traitChip = (trait: StaffMember['trait']): string =>
  trait ? `<span class="sf-trait ${trait === 'lazy' ? 'bad' : ''}" title="${TRAITS[trait].text}">${TRAITS[trait].name}</span>` : '';

function doing(state: GameState, s: StaffMember): string {
  if (isAway(s)) return `Away training · back ${clockText(s.trainingUntil!)}`;
  if (s.role === 'sales_rep') return `Out meeting clients · +${salesExtraOffers(state)} offers/day, +${Math.round(salesPayBonus(state) * 100)}% pay`;
  if (s.role === 'account_manager' && !s.task) {
    return receptionDesks(state).length === 0 ? 'Needs a reception desk to work at' : 'Every desk is staffed: build another reception desk';
  }
  if (!s.task) return s.path.length ? 'Heading to the staff room' : 'Idle';
  if (s.task.kind === 'desk') {
    if (s.path.length > 0) return 'Walking to reception';
    const offer = state.contracts.offers.find((o) => o.id === s.task!.offerId);
    return offer ? `Talking to ${offer.name}` : 'At reception, waiting for clients';
  }
  const b = state.buildings.find((x) => x.id === s.task!.buildingId);
  const name = b ? buildingDef(b.kind).name : 'job';
  const verb = { build: 'Building', repair: 'Repairing', service: 'Servicing' }[s.task.kind as 'build' | 'repair' | 'service'];
  if (s.path.length > 0) return `Walking to ${verb.toLowerCase()} ${name}`;
  if (s.task.kind === 'build' && b) return `${verb} ${name} · ${Math.round((1 - b.buildRemaining / buildTicks(b.kind)) * 100)}%`;
  return `${verb} ${name}`;
}

// Hire from today's candidates, see what everyone's doing, train and let go (T).
export class StaffPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private confirmFire: number | null = null;
  // The team member whose card is expanded (clicked in the list or the world).
  private focus: number | null = null;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: StaffHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel staff-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.staff}<h2>Staff</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, [data-focus]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const act = el.dataset.act;
      const id = Number(el.dataset.id);
      if (act === 'close') this.toggle(false);
      else if (act === 'hire') handlers.onHire(id);
      else if (act === 'train') handlers.onTrain(id, (el.dataset.spec as Specialism | undefined) || undefined);
      else if (act === 'fire') {
        if (this.confirmFire === id) {
          handlers.onFire(id);
          this.confirmFire = null;
        } else {
          this.confirmFire = id;
        }
      } else if (el.dataset.focus) {
        const f = Number(el.dataset.focus);
        this.focus = this.focus === f ? null : f;
      }
      this.lastHtml = '';
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.confirmFire = null;
    this.lastHtml = '';
  }

  // Opens the panel on one person's card (clicked in the 3D view).
  show(staffId: number): void {
    this.focus = staffId;
    this.toggle(true);
    requestAnimationFrame(() => this.body.querySelector(`[data-focus="${staffId}"]`)?.scrollIntoView({ block: 'center' }));
  }

  update(state: GameState): void {
    if (!this.open) return;
    const capacity = staffCapacity(state);
    const tired = staffSpeedFactor(state) < 1;
    const racks = state.buildings.filter((b) => categoryOf(b) === 'rack');
    const overdue = racks.filter((r) => isOverdue(state, r)).length;
    const waiting = state.buildings.filter((b) => b.status === 'building' || (b.status === 'repairing' && b.repairDoneTick === null)).length;

    const tips: string[] = [];
    if (tired) tips.push('More staff than your staff rooms can house: everyone works slower. Paint a <b>Staff room</b> zone with a coffee machine and break tables.');
    if (!hasStorage(state)) tips.push('No storage room: engineers build and repair slower. Paint a <b>Storage room</b> zone and add shelving.');
    if (overdue > 0) tips.push(`${overdue} rack${overdue > 1 ? 's are' : ' is'} overdue for servicing and earning less. Hire a <b>technician</b>.`);

    const html = `
      <div class="ct-tiles">
        ${tile('Staff', `${state.staff.length}<small> / ${capacity}</small>`, tired ? 'bad' : '')}
        ${tile('Wages', `£${wagesPerTick(state).toFixed(2)}<small>/min</small>`)}
        ${tile('Jobs waiting', String(waiting), waiting > 0 ? 'accent' : '')}
        ${tile('Racks overdue', String(overdue), overdue > 0 ? 'bad' : 'good')}
        ${tile('Storage room', hasStorage(state) ? 'Yes' : 'No', hasStorage(state) ? 'good' : '')}
      </div>
      ${tips.map((t) => `<div class="ct-alert">${t}</div>`).join('')}
      ${this.hiring(state)}
      <h3>Team <span class="ct-count">${state.staff.length}</span><span class="muted ct-note">click someone for their card</span></h3>
      ${state.staff.map((s) => this.member(state, s)).join('')}`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }

  private hiring(state: GameState): string {
    if (!isUnlocked(state, 'staff')) {
      return `<h3>Hire</h3><div class="ct-empty">Hiring unlocks at level ${unlockFor('staff')?.level ?? '?'}.</div>`;
    }
    const roles = hirableRoles(state);
    const locked = (Object.keys(CONFIG.staff.roles) as StaffRole[]).filter((r) => !roles.includes(r));
    const groups = roles.map((role) => {
      const info = ROLE_INFO[role];
      const cands = state.candidates.filter((c) => c.role === role);
      return `
        <div class="sf-role" style="--c:${info.colour}">
          <div class="sf-role-head"><b>${CONFIG.staff.roles[role].name}s</b><span class="muted">${info.blurb}</span></div>
          <div class="sf-cands">${cands.length ? cands.map((c) => this.candidate(state, c)).join('') : '<div class="muted">Everyone today has been hired. New candidates tomorrow.</div>'}</div>
        </div>`;
    });
    const lockedNote = locked.length
      ? `<div class="muted fine">${locked.map((r) => `${CONFIG.staff.roles[r].name}s from level ${CONFIG.staff.roles[r].minLevel}`).join(' · ')}</div>`
      : '';
    return `<h3>Hire <span class="muted ct-note">new candidates every morning</span></h3>${groups.join('')}${lockedNote}`;
  }

  private candidate(state: GameState, c: Candidate): string {
    const fee = hireFeeOf(c);
    const wage = wageOf({ ...c, founder: false });
    const reason = state.cash < fee ? `Need ${money(fee)}` : '';
    return `
      <div class="sf-cand">
        <div class="sf-avatar" style="background:${ROLE_INFO[c.role].colour}">${c.name.split(' ').map((w) => w[0]).join('')}</div>
        <div class="sf-who"><b>${c.name}</b><span>${pips(c.level)} ${traitChip(c.trait)}</span></div>
        <div class="sf-cost"><span>Hire ${money(fee)}</span><span class="muted">£${wage.toFixed(2)}/min</span></div>
        <button data-act="hire" data-id="${c.id}" class="primary" ${reason ? 'disabled' : ''}>${reason || 'Hire'}</button>
      </div>`;
  }

  private member(state: GameState, s: StaffMember): string {
    const info = ROLE_INFO[s.role];
    const open = this.focus === s.id;
    const spec = s.specialism ? `<span class="sf-spec" title="${SPECIALISMS[s.specialism].text}">★ ${SPECIALISMS[s.specialism].name}</span>` : '';
    const row = `
      <div class="sf-member ${open ? 'open' : ''} ${isAway(s) ? 'away' : ''}" data-focus="${s.id}" style="--c:${info.colour}">
        <span class="ct-pill" style="background:${info.colour}26;color:${info.colour}">${CONFIG.staff.roles[s.role].name}</span>
        <b>${s.founder ? 'You' : s.name}</b>${pips(s.level)}${traitChip(s.trait)}${spec}
        <span class="muted sf-doing">${doing(state, s)}</span>
      </div>`;
    return open ? row + this.card(state, s) : row;
  }

  // The expanded card: numbers, training and letting go.
  private card(state: GameState, s: StaffMember): string {
    const nextJobs = G.levelJobs[s.level];
    const progress = nextJobs === undefined ? 'Top level' : `${s.jobs} / ${nextJobs} jobs to level ${s.level + 1}`;
    const speed = Math.round(workSpeedOf(state, s) * 100);
    const cost = trainingCost(s);
    const away = isAway(s);
    const canAfford = state.cash >= cost;
    const trainLevel = s.level < MAX_LEVEL
      ? `<button data-act="train" data-id="${s.id}" ${away || !canAfford ? 'disabled' : ''}>Train to level ${s.level + 1} · ${money(cost)}</button>`
      : '';
    const specs = specialismsFor(s).map((sp) => `
      <button data-act="train" data-id="${s.id}" data-spec="${sp}" ${away || !canAfford ? 'disabled' : ''} title="${SPECIALISMS[sp].text}">
        Specialise: ${SPECIALISMS[sp].name} · ${money(cost)}</button>`).join('');
    const specHint = !s.specialism && s.level < G.specialismLevel && (Object.values(SPECIALISMS).some((x) => x.role === s.role))
      ? `<div class="muted fine">Specialisms open up at level ${G.specialismLevel}.</div>` : '';
    const fire = s.founder
      ? '<span class="muted">Founder · free, can’t be let go</span>'
      : `<button data-act="fire" data-id="${s.id}" class="danger">${this.confirmFire === s.id ? 'Click again to let go' : 'Let go'}</button>`;
    return `
      <div class="sf-card">
        <div class="sf-stats">
          <div><span>Level</span><b>${s.level}</b><small>${progress}</small></div>
          <div><span>Speed now</span><b>${speed}%</b><small>${s.trait ? TRAITS[s.trait].text : 'No trait'}</small></div>
          <div><span>Wage</span><b>£${wageOf(s).toFixed(2)}</b><small>per minute</small></div>
          <div><span>Jobs done</span><b>${s.jobs}</b><small>${s.specialism ? SPECIALISMS[s.specialism].text : 'No specialism'}</small></div>
        </div>
        <div class="sf-actions">${trainLevel}${specs}${fire}</div>
        ${away ? '' : `<div class="muted fine">Training takes ${G.trainingTicks / 60} game hours away from work.</div>`}
        ${specHint}
      </div>`;
  }
}
