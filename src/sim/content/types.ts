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
}

export interface Achievement {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  name: string;
  description: string;
  condition: Condition;
  reward: Reward;
}
