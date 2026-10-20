// Compliance: industry certifications (content/certifications.ts), audited
// against what's actually in place. Apply (commands.ts applyForCertification)
// and pay the fee; the audit reports after CONFIG.compliance.auditDays and
// passes if every requirement is met then. While held:
// - a renewal costs a share of the fee every renewEveryDays,
// - a daily check watches the requirements: one missing puts the
//   certification at risk, and still missing graceDays later it's revoked,
//   breaking contracts with clients who need it and costing reputation.
// Held certifications raise contract pay and bring clients who need them.

import { CONFIG } from '../config';
import { evaluate, isMet } from './conditions';
import { CERTIFICATIONS } from './content/certifications';
import type { Certification } from './content/types';
import { breakContract } from './contracts';
import { isUnlocked } from './progression';
import { adjustReputation } from './reputation';
import type { ComplianceState, GameState } from './state';

const C = CONFIG.compliance;

export function certification(id: string): Certification | undefined {
  return CERTIFICATIONS.find((c) => c.id === id);
}

export function holds(state: GameState, id: string): boolean {
  return state.compliance.held.some((h) => h.id === id);
}

export function heldIds(state: GameState): string[] {
  return state.compliance.held.map((h) => h.id);
}

// Requirements not met right now, by label.
export function missingRequirements(state: GameState, cert: Certification): string[] {
  return cert.requirements.filter((r) => !isMet(state, r.condition)).map((r) => r.label);
}

// Each requirement with its current value and target, for the panel.
export function requirementProgress(state: GameState, cert: Certification) {
  return cert.requirements.map((r) => ({ ...r, ...evaluate(state, r.condition), met: isMet(state, r.condition) }));
}

export type CertStatus = 'held' | 'at_risk' | 'auditing' | 'available' | 'locked_level' | 'locked_requires';

export function certStatus(state: GameState, cert: Certification, level: number): CertStatus {
  const held = state.compliance.held.find((h) => h.id === cert.id);
  if (held) return held.atRiskSince === null ? 'held' : 'at_risk';
  if (state.compliance.audit?.id === cert.id) return 'auditing';
  if (cert.level > level) return 'locked_level';
  if (!cert.requires.every((id) => holds(state, id))) return 'locked_requires';
  return 'available';
}

// Extra pay on new contract offers from every certification held.
export function compliancePayBonus(state: GameState): number {
  return state.compliance.held.reduce((sum, h) => sum + (certification(h.id)?.payBonus ?? 0), 0);
}

export function renewalCost(cert: Certification): number {
  return Math.round(cert.fee * C.renewFraction);
}

function log(compliance: ComplianceState, tick: number, text: string, good: boolean): void {
  compliance.log.push({ tick, text, good });
  if (compliance.log.length > C.logLength) compliance.log.splice(0, compliance.log.length - C.logLength);
}

// Takes a certification away: contracts that need it end as broken promises.
export function revoke(state: GameState, id: string, reason: string): void {
  const cert = certification(id);
  // Certifications that need this one go too.
  const dependants = state.compliance.held.filter((h) => certification(h.id)?.requires.includes(id));
  state.compliance.held = state.compliance.held.filter((h) => h.id !== id);
  adjustReputation(state, C.revokedReputation);
  const broken = state.contracts.active.filter((c) => c.certifications?.includes(id));
  for (const c of broken) breakContract(state, c.id);
  const lost = broken.length ? ` ${broken.length} client${broken.length > 1 ? 's' : ''} who needed it walked away.` : '';
  log(state.compliance, state.tick, `${cert?.name ?? id} revoked: ${reason}.${lost}`, false);
  for (const d of dependants) revoke(state, d.id, `it needs ${cert?.name ?? id}`);
}

// Runs every tick: reports an audit when it's due.
export function stepCompliance(state: GameState): void {
  const audit = state.compliance.audit;
  if (!audit || state.tick < audit.endTick) return;
  state.compliance.audit = null;
  const cert = certification(audit.id);
  if (!cert || holds(state, cert.id)) return;
  const missing = missingRequirements(state, cert);
  if (missing.length === 0) {
    state.compliance.held.push({ id: cert.id, since: state.tick, atRiskSince: null });
    log(state.compliance, state.tick, `Passed the ${cert.name} audit. New clients will come looking.`, true);
  } else {
    log(state.compliance, state.tick, `Failed the ${cert.name} audit: ${missing.join('; ')}. The fee isn't refunded.`, false);
  }
}

// Runs once a game day: renewals and the daily check.
export function dailyCompliance(state: GameState): void {
  if (!isUnlocked(state, 'compliance')) return;
  const day = CONFIG.time.ticksPerDay;
  for (const held of [...state.compliance.held]) {
    const cert = certification(held.id);
    if (!cert || !holds(state, held.id)) continue;
    const daysHeld = Math.round((state.tick - held.since) / day);
    if (daysHeld > 0 && daysHeld % C.renewEveryDays === 0) {
      state.cash -= renewalCost(cert);
      log(state.compliance, state.tick, `Renewed ${cert.name}: £${renewalCost(cert).toLocaleString('en-GB')}.`, true);
    }
    const missing = missingRequirements(state, cert);
    if (missing.length === 0) {
      if (held.atRiskSince !== null) log(state.compliance, state.tick, `${cert.name} is back in good standing.`, true);
      held.atRiskSince = null;
    } else if (held.atRiskSince === null) {
      held.atRiskSince = state.tick;
      log(state.compliance, state.tick, `${cert.name} at risk: ${missing.join('; ')}. Fix it within ${C.graceDays} days.`, false);
    } else if (state.tick - held.atRiskSince >= C.graceDays * day) {
      revoke(state, held.id, missing.join('; '));
    }
  }
}
