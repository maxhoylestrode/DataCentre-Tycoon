// The contract board: rolling each day's offers from the customer types the
// player's level allows.

import { CONFIG } from '../config';
import { CUSTOMER_NAME_PREFIXES, CUSTOMER_TYPES } from './content/customers';
import type { CustomerType, Range } from './content/types';
import { isUnlocked, levelOf } from './progression';
import { prestigeExtraOffers, prestigePayBonus } from './prestige';
import { pick, randomInt, randomRange } from './rng';
import { type ContractTerms, dayOf, type GameState } from './state';

export function contractBoardOpen(state: GameState): boolean {
  return isUnlocked(state, 'contract_board');
}

export function availableCustomerTypes(level: number): CustomerType[] {
  return CUSTOMER_TYPES.filter((t) => t.minLevel <= level);
}

// toFixed strips float noise like 4.3100000000000005.
const roundTo = (n: number, step: number): number => Number((Math.round(n / step) * step).toFixed(6));

function rollRange(state: GameState, [min, max]: Range): number {
  return randomRange(state, min, max);
}

// Suffixes starting lower case join on ("Pixelly"), others get a space ("Pixel Games").
function companyName(state: GameState, type: CustomerType): string {
  const prefix = pick(state, CUSTOMER_NAME_PREFIXES);
  const suffix = pick(state, type.nameSuffixes);
  return /^[a-z]/.test(suffix) ? `${prefix}${suffix}` : `${prefix} ${suffix}`;
}

export function rollOffer(state: GameState, type: CustomerType): ContractTerms {
  const racks = randomInt(state, type.racks[0], type.racks[1]);
  const days = randomInt(state, type.days[0], type.days[1]);
  const prestige = 1 + prestigePayBonus(state);
  const payPerRackPerTick = roundTo(
    CONFIG.contracts.basePayPerRackPerTick * rollRange(state, type.payMultiplier) * prestige,
    0.01,
  );
  // SLA in 0.5% steps so it reads cleanly (95%, 97.5%...).
  const sla = Math.min(1, roundTo(rollRange(state, type.sla), 0.005));
  const totalPay = racks * days * CONFIG.time.ticksPerDay * payPerRackPerTick;

  const terms: ContractTerms = {
    id: state.contracts.nextId,
    customerType: type.id,
    name: companyName(state, type),
    racks,
    days,
    payPerRackPerTick,
    sla,
    bonus: roundTo(totalPay * type.bonusFraction, 50),
    penalty: roundTo(totalPay * type.penaltyFraction, 50),
    xp: type.xp,
    ...(type.requirement ? { requirement: { ...type.requirement } } : {}),
  };
  state.contracts.nextId += 1;
  return terms;
}

// Replaces the offers at the start of each day while the board is unlocked.
// Safe to call any time; it does nothing if today's offers already exist.
export function refreshOffers(state: GameState): void {
  if (!contractBoardOpen(state)) return;
  const day = dayOf(state);
  if (state.contracts.offersDay === day) return;

  const types = availableCustomerTypes(levelOf(state));
  state.contracts.offers = [];
  const count = CONFIG.contracts.offersPerDay + prestigeExtraOffers(state);
  for (let i = 0; i < count && types.length > 0; i++) {
    state.contracts.offers.push(rollOffer(state, pick(state, types)));
  }
  state.contracts.offersDay = day;
}
