// Sales staff, who take contract work off the player's hands.
//
// Account managers staff a reception desk (people.ts walks them there). When
// a client is waiting, a manager talks to them for a while, then decides:
// sign if you have the racks, your recent uptime beats what the client wants,
// and your total income goes up with it.
// Otherwise they leave the client with a note saying why. With autoSign off
// they only advise. Sales reps bring in more clients a day and negotiate
// better pay on new offers.

import { CONFIG } from '../config';
import { signContract } from './commands';
import { canTakeOffer } from './contracts';
import { incomeBreakdown } from './economy';
import { networkEfficiency } from './network';
import { staffSpeedFactor } from './people';
import { powerEfficiency } from './power';
import type { Contract, ContractTerms, GameState, StaffMember } from './state';

const S = CONFIG.staff.sales;

const count = (state: GameState, role: StaffMember['role']): number => state.staff.filter((m) => m.role === role).length;

// Account managers standing at their desk, ready to talk to clients.
export function managersAtDesks(state: GameState): StaffMember[] {
  return state.staff.filter((m) => m.role === 'account_manager' && m.task?.kind === 'desk' && m.path.length === 0);
}

// Extra clients a day from sales reps.
export function salesExtraOffers(state: GameState): number {
  return Math.min(S.maxExtraOffers, count(state, 'sales_rep') * S.offersPerRep);
}

// Extra pay sales reps negotiate on new offers (0.06 = +6%).
export function salesPayBonus(state: GameState): number {
  return Math.min(S.maxPayBonus, count(state, 'sales_rep') * S.payPerRep);
}

// Average uptime over the last few game hours, or right now if there's no history.
export function recentUptime(state: GameState): number {
  const samples = state.history.samples.slice(-S.uptimeHours).filter((s) => s.uptime !== undefined);
  if (samples.length === 0) return powerEfficiency(state) * networkEfficiency(state);
  return samples.reduce((sum, s) => sum + s.uptime!, 0) / samples.length;
}

// Income per tick now, and with this offer signed. Racks moved to the
// contract stop earning walk-in money, but the walk-in racks left over then
// face less market saturation, so this compares real totals, not averages.
export function incomeWithOffer(state: GameState, offer: ContractTerms): { before: number; after: number } {
  const now = incomeBreakdown(state);
  const trial: Contract = { ...offer, startTick: state.tick, endTick: state.tick + 1, servedRackTicks: 0, promisedRackTicks: 0 };
  state.contracts.active.push(trial);
  try {
    const signed = incomeBreakdown(state);
    return { before: now.walkIn + now.contracts, after: signed.walkIn + signed.contracts };
  } finally {
    state.contracts.active.pop();
  }
}

// An account manager's verdict on an offer.
export function reviewOffer(state: GameState, offer: ContractTerms): { recommend: boolean; note: string } {
  if (!canTakeOffer(state, offer)) {
    return { recommend: false, note: offer.requirement ? 'Not enough suitable racks free.' : 'Not enough racks free.' };
  }
  const uptime = recentUptime(state);
  if (uptime < offer.sla + S.uptimeMargin) {
    return {
      recommend: false,
      note: `Your uptime has been ${(uptime * 100).toFixed(1)}%, under the ${(offer.sla * 100).toFixed(1)}% they want. Risky.`,
    };
  }
  const { before, after } = incomeWithOffer(state, offer);
  if (after < before) {
    return {
      recommend: false,
      note: `Your income would drop by £${(before - after).toFixed(2)}/min: those racks earn more from walk-ins.`,
    };
  }
  return { recommend: true, note: `Good deal: +£${(after - before).toFixed(2)}/min, and you can keep the uptime promise.` };
}

// Runs every tick, after clients have moved.
export function stepSales(state: GameState): void {
  if (!state.staffSim) return;
  const managers = managersAtDesks(state);
  if (managers.length === 0) return;
  const talking = new Set(managers.flatMap((m) => (m.task!.offerId !== undefined ? [m.task!.offerId] : [])));
  const rate = staffSpeedFactor(state);

  for (const m of managers) {
    const task = m.task!;
    let offer = task.offerId !== undefined ? state.contracts.offers.find((o) => o.id === task.offerId) : undefined;
    if (task.offerId !== undefined && !offer) delete task.offerId; // signed by the player, or gone home
    if (!offer) {
      // Next client in the queue nobody has talked to yet.
      offer = state.contracts.offers.find((o) => o.arrived && !o.review && !talking.has(o.id));
      if (!offer) continue;
      task.offerId = offer.id;
      task.workLeft = S.negotiateTicks;
      talking.add(offer.id);
      continue;
    }
    task.workLeft -= rate;
    if (task.workLeft > 0) continue;
    delete task.offerId;
    const review = reviewOffer(state, offer);
    if (review.recommend && state.contracts.autoSign && signContract(state, offer.id).ok) {
      const signed = state.contracts.active.find((c) => c.id === offer.id);
      if (signed) signed.signedByStaff = true;
      state.progress.stats.staffSigned += 1;
      continue;
    }
    offer.review = review;
  }
}
