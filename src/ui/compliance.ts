import { CONFIG } from '../config';
import { type ConditionType, FRACTION_CONDITIONS, uptimeOver } from '../sim/conditions';
import { certification, certStatus, renewalCost, requirementProgress } from '../sim/compliance';
import { CERTIFICATIONS } from '../sim/content/certifications';
import { CUSTOMER_TYPES } from '../sim/content/customers';
import type { Certification } from '../sim/content/types';
import { isUnlocked, levelOf, unlockFor } from '../sim/progression';
import type { GameState } from '../sim/state';
import { ICONS } from './icons';

export interface ComplianceHandlers {
  onApply(id: string): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;

function valueText(type: ConditionType, v: number, target: number): string {
  if (!FRACTION_CONDITIONS.includes(type)) return `${Math.floor(v)} / ${target}`;
  // Uptime promises need decimals (99.5%, 99.9%).
  const digits = type === 'recentUptime' ? 1 : 0;
  return `${pct(v, digits)} / ${pct(target, digits)}`;
}

// Certifications: apply for audits, see what each needs and how you're doing.
export class CompliancePanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: ComplianceHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel compliance-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.compliance}<h2>Compliance</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.act === 'apply' && button.dataset.id) handlers.onApply(button.dataset.id);
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
    if (!isUnlocked(state, 'compliance')) {
      this.render(`<p class="muted">Compliance unlocks at level ${unlockFor('compliance')?.level ?? '?'}: big clients want proof you run a tight ship.</p>`);
      return;
    }
    const level = levelOf(state);
    const C = CONFIG.compliance;
    const audit = state.compliance.audit;
    const auditing = audit ? certification(audit.id) : undefined;
    const intro = `
      <ol class="cp-steps">
        <li><b>Apply</b> and pay the fee. The auditor reports after ${C.auditDays} day${C.auditDays > 1 ? 's' : ''}.</li>
        <li>You pass if <b>every requirement is ticked</b> when they report.</li>
        <li>Keep it ticked: a daily check puts a certification <b>at risk</b>, and after ${C.graceDays} days it's <b>revoked</b>, breaking contracts that need it.</li>
      </ol>
      ${auditing ? `<div class="ct-meter"><div class="ct-meter-label"><span>Audit in progress</span><b>${auditing.name}</b><span class="muted">${Math.ceil((audit!.endTick - state.tick) / 60)}h left</span></div></div>` : ''}`;

    const cards = CERTIFICATIONS.map((cert) => this.card(state, cert, level, audit !== null));
    const log = state.compliance.log.slice().reverse().map((l) => `<div class="cp-log ${l.good ? 'good' : 'bad'}">${l.text}</div>`);
    this.render(`${intro}<div class="cp-grid">${cards.join('')}</div>${log.length ? `<h3>Recent</h3>${log.join('')}` : ''}`);
  }

  private card(state: GameState, cert: Certification, level: number, busy: boolean): string {
    const status = certStatus(state, cert, level);
    const clients = CUSTOMER_TYPES.filter((t) => t.certifications?.includes(cert.id)).map((t) => t.name);
    const rows = requirementProgress(state, cert).map((r) => {
      let value = valueText(r.condition.type, r.current, r.target);
      if (r.condition.type === 'recentUptime') {
        const u = uptimeOver(state, r.condition.days);
        if (u.hours < u.needed) value = `${u.hours}/${u.needed}h recorded`;
      }
      return `<div class="cp-req ${r.met ? 'met' : ''}"><i>${r.met ? '✓' : '✕'}</i><span>${r.label}</span><b>${value}</b></div>`;
    });
    let action: string;
    if (status === 'held') action = `<span class="ct-pill good">Certified</span><span class="muted">Renews every ${CONFIG.compliance.renewEveryDays} days · ${money(renewalCost(cert))}</span>`;
    else if (status === 'at_risk') action = '<span class="ct-pill bad">At risk: fix the ✕ before the next checks</span>';
    else if (status === 'auditing') action = '<span class="ct-pill time">Being audited</span>';
    else if (status === 'locked_level') action = `<span class="muted">Level ${cert.level}</span>`;
    else if (status === 'locked_requires') {
      action = `<span class="muted">Needs ${cert.requires.map((id) => certification(id)?.name ?? id).join(', ')}</span>`;
    } else {
      const reason = busy ? 'Another audit is running' : state.cash < cert.fee ? `Need ${money(cert.fee)}` : '';
      action = `<button data-act="apply" data-id="${cert.id}" class="primary" ${reason ? 'disabled' : ''}>${reason || `Apply for audit · ${money(cert.fee)}`}</button>`;
    }
    return `
      <div class="rs-card cp-card ${status}">
        <div class="rs-top"><b>${cert.name}</b><span class="muted">Lv ${cert.level} · ${money(cert.fee)}</span></div>
        <div class="rs-effect">+${pct(cert.payBonus)} contract pay${clients.length ? ` · brings ${clients.join(', ')}` : ''}</div>
        <div class="muted rs-desc">${cert.description}</div>
        <div class="cp-reqs">${rows.join('')}</div>
        <div class="rs-action">${action}</div>
      </div>`;
  }

  private render(html: string): void {
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
  }
}
