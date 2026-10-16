// Shapes of progression content. The content files next to this one are
// plain data of these types; the engine that reads them is sim/progression.ts.

import type { Condition } from '../conditions';

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
  // For 'building': a key of CONFIG.buildings. For 'mechanic': an id from MECHANICS.
  id: string;
  type: 'building' | 'mechanic';
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

export interface Achievement {
  // Stable id, stored in saves. Never rename or reuse one.
  id: string;
  name: string;
  description: string;
  condition: Condition;
  reward: Reward;
}
