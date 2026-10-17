import { buildingDef, CONFIG, type StaffRole } from '../config';
import { buildTicks, isOverdue } from '../sim/buildings';
import { wagesPerTick } from '../sim/economy';
import { staffSpeedFactor } from '../sim/people';
import { isUnlocked, unlockFor } from '../sim/progression';
import { categoryOf, type GameState, type StaffMember } from '../sim/state';
import { hasStorage, staffCapacity } from '../sim/zones';
import { ICONS } from './icons';

export interface StaffHandlers {
  onHire(role: StaffRole): void;
  onFire(staffId: number): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const tile = (label: string, value: string, cls = ''): string =>
  `<div class="ct-tile ${cls}"><div class="ct-tile-value">${value}</div><div class="ct-tile-label">${label}</div></div>`;

const ROLE_INFO: Record<StaffRole, { blurb: string; colour: string }> = {
  engineer: { blurb: 'Builds everything you place and repairs failed racks.', colour: '#ffb347' },
  technician: { blurb: `Services racks every ${CONFIG.maintenance.intervalTicks / CONFIG.time.ticksPerDay} days so they keep full income.`, colour: '#4aa8ff' },
};

function doing(state: GameState, s: StaffMember): string {
  if (!s.task) return s.path.length ? 'Heading to the staff room' : 'Idle';
  const b = state.buildings.find((x) => x.id === s.task!.buildingId);
  const name = b ? buildingDef(b.kind).name : 'job';
  const verb = { build: 'Building', repair: 'Repairing', service: 'Servicing' }[s.task.kind];
  if (s.path.length > 0) return `Walking to ${verb.toLowerCase()} ${name}`;
  if (s.task.kind === 'build' && b) return `${verb} ${name} · ${Math.round((1 - b.buildRemaining / buildTicks(b.kind)) * 100)}%`;
  return `${verb} ${name}`;
}

// Hire and fire staff, and see what everyone's doing (T).
export class StaffPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private confirmFire: number | null = null;
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
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      const act = button.dataset.act;
      if (act === 'close') this.toggle(false);
      else if (act === 'hire') handlers.onHire(button.dataset.role as StaffRole);
      else if (act === 'fire') {
        const id = Number(button.dataset.id);
        if (this.confirmFire === id) {
          handlers.onFire(id);
          this.confirmFire = null;
        } else {
          this.confirmFire = id;
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
    this.confirmFire = null;
    this.lastHtml = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    const capacity = staffCapacity(state);
    const tired = staffSpeedFactor(state) < 1;
    const racks = state.buildings.filter((b) => categoryOf(b) === 'rack');
    const overdue = racks.filter((r) => isOverdue(state, r)).length;
    const waiting = state.buildings.filter((b) => b.status === 'building' || (b.status === 'repairing' && b.repairDoneTick === null)).length;
    const canHire = isUnlocked(state, 'staff');

    const hire = (Object.keys(CONFIG.staff.roles) as StaffRole[]).map((role) => {
      const def = CONFIG.staff.roles[role];
      const info = ROLE_INFO[role];
      const reason = !canHire ? `Hiring unlocks at level ${unlockFor('staff')?.level ?? '?'}` : state.cash < def.hireFee ? `Need ${money(def.hireFee)}` : '';
      return `
        <div class="ct-card" style="--ct-color:${info.colour}">
          <div class="ct-card-head"><div class="ct-avatar" style="background:${info.colour}">${def.name[0]}</div>
            <div class="ct-who"><b>${def.name}</b><span class="muted">${info.blurb}</span></div></div>
          <div class="ct-rewards"><span class="ct-pill bad">Hire ${money(def.hireFee)}</span><span class="ct-pill bad">Wage £${def.wagePerTick.toFixed(2)}/min</span>
            <button data-act="hire" data-role="${role}" class="primary ct-cancel" ${reason ? 'disabled' : ''}>${reason || 'Hire'}</button></div>
        </div>`;
    });

    const rows = state.staff.map((s) => {
      const def = CONFIG.staff.roles[s.role];
      const colour = ROLE_INFO[s.role].colour;
      const fire = s.founder
        ? '<span class="muted">Founder · free</span>'
        : `<button data-act="fire" data-id="${s.id}" class="danger">${this.confirmFire === s.id ? 'Click again to let go' : 'Let go'}</button>`;
      return `<div class="ct-hist"><span class="ct-pill" style="background:${colour}26;color:${colour}">${def.name}</span><b>${s.founder ? 'You' : `#${s.id}`}</b><span class="muted">${doing(state, s)}</span>${fire}</div>`;
    });

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
      <h3>Hire</h3><div class="ct-grid">${hire.join('')}</div>
      <h3>Team <span class="ct-count">${state.staff.length}</span></h3>${rows.join('')}`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }
}
