// Shapes of progression content. The content files next to this one are
// plain data of these types; the engine that reads them is sim/progression.ts.

import type { PartSlot } from '../../config';
import type { Condition } from '../conditions';

// A rack component. Each slot's parts form an upgrade path in the order
// listed; the first part in a slot is the stock part every rack starts with.
// income / powerDraw / heat are what the part adds over the stock part,
// per server (multiplied by the rack's partMultiplier / powerFactor /
// heatFactor). cost is per server too.
export interface Part {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  slot: PartSlot;
  brand: string;
  model: string;
  // Short human-readable spec line, e.g. "64 cores, 2.45 GHz".
  specs: string;
  level: number;
  cost: number;
  income: number;
  powerDraw: number;
  heat: number;
  // Cooling slot only: fraction of the rack's heat removed, 0..1.
  heatReduction?: number;
  // CPU slot only: cores per server.
  cores?: number;
  // Network slot only: card speed in Gbps.
  gbps?: number;
}

// What a rack must have to serve a contract. All given fields must be met.
export interface ContractRequirement {
  // Minimum rack model tier (1 = Entry, 2 = Performance, 3 = Enterprise...).
  minRackTier?: number;
  // Minimum CPU cores in the whole rack (cores per server × servers).
  minCores?: number;
  // Rack must have a GPU slot.
  gpu?: boolean;
}

// An internet line speed (content/uplinks.ts).
export interface Uplink {
  // Stable id, stored in saves.
  id: string;
  name: string;
  mbps: number;
  level: number;
  cost: number;
  rentalPerTick: number;
}

// What a research project improves. Values are fractions (0.1 = 10%) except
// marketRacks, which is a number of racks.
export type ResearchEffectKind =
  | 'powerOutput'
  | 'coolingStrength'
  | 'electricityDiscount'
  | 'contractPay'
  | 'walkInIncome'
  | 'marketRacks'
  | 'staffSpeed'
  | 'ageingSlower'
  | 'bandwidthSaving'
  | 'eventChance'
  | 'upkeepDiscount';

export interface ResearchProject {
  // Stable id, stored in saves.
  id: string;
  name: string;
  description: string;
  level: number;
  cost: number;
  // Game days to finish.
  days: number;
  // Projects that must be finished first.
  requires: string[];
  effects: { kind: ResearchEffectKind; value: number }[];
}

// A room-sized plot on the map grid.
export interface Lot {
  // Stable id, stored in saves.
  id: string;
  col: number;
  row: number;
}

// Room-wide looks bought from the Style panel. One active per slot.
export interface RoomStyle {
  // Stable id, stored in saves.
  id: string;
  slot: 'floor' | 'wall' | 'lighting';
  name: string;
  level: number;
  cost: number;
  prestige: number;
  // Main colour (floor or wall), or light colour.
  color: number;
  // Lighting only: brightness multiplier and an optional accent glow colour.
  intensity?: number;
  accent?: number;
}

export interface Tier {
  // Stable id, never renamed.
  id: string;
  name: string;
  // First level of this tier. Strictly increasing down the list, first is 1.
  minLevel: number;
  // The new kind of problem this tier introduces.
  description: string;
}

export interface Unlock {
  // For 'building': a key of CONFIG.buildings. For 'floor': a key of
  // CONFIG.floors. For 'wall': a key of CONFIG.walls. For 'mechanic': an
  // id from MECHANICS.
  id: string;
  type: 'building' | 'floor' | 'wall' | 'mechanic';
  level: number;
  // Required for mechanics. Buildings use their name from config.
  name?: string;
  description?: string;
}

export interface Reward {
  xp: number;
  cash?: number;
}

export interface Goal {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  description: string;
  condition: Condition;
  reward: Reward;
  // Goal ids that must be completed before this one appears.
  after?: string[];
}

// [min, max], both inclusive.
export type Range = [number, number];

export interface CustomerType {
  // Stable id, stored on contracts. Never rename or reuse one.
  id: string;
  name: string;
  // Offers from this customer type appear from this level.
  minLevel: number;
  racks: Range;
  days: Range;
  // Pay per rack = CONFIG.contracts.basePayPerRackPerTick * this.
  payMultiplier: Range;
  // Promised uptime, 0..1 (0.98 = 98%).
  sla: Range;
  // Bonus and penalty as fractions of the contract's total pay.
  bonusFraction: number;
  penaltyFraction: number;
  // XP for completing a contract with the promise kept.
  xp: number;
  // Company names are a prefix from CUSTOMER_NAME_PREFIXES plus one of these.
  nameSuffixes: string[];
  // Accent colour for this customer type in the contracts panel.
  color: number;
  // Only racks meeting this can serve the contract (and it can't be signed without them).
  requirement?: ContractRequirement;
  // Certification ids (content/certifications.ts) you must hold for this
  // client to visit. Losing one breaks their contracts.
  certifications?: string[];
}

export interface Achievement {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  name: string;
  description: string;
  condition: Condition;
  reward: Reward;
}

// A check an auditor makes (content/certifications.ts). Uses the same
// conditions as goals: met when the current value reaches `min`.
export interface CertRequirement {
  label: string;
  condition: Condition;
}

// An industry certification, audited against what's actually in place.
export interface Certification {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  name: string;
  description: string;
  level: number;
  // Paid when you apply for the audit; a share of it again at each renewal.
  fee: number;
  // Extra pay on new contract offers while held, as a fraction.
  payBonus: number;
  // Certification ids you must already hold.
  requires: string[];
  requirements: CertRequirement[];
}

// Decorations that look good together: one of each, built, adds `prestige`
// on top of the items' own.
export interface DecorSet {
  // Stable id. Never rename or reuse one.
  id: string;
  name: string;
  // Building ids with category 'decor' or 'furniture'.
  items: string[];
  prestige: number;
}
