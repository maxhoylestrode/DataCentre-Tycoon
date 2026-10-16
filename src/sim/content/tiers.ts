import type { Tier } from './types';

// Groups of levels. Each tier should add a new kind of problem, not just
// bigger numbers. Tiers past the current content are listed so the HUD can
// name them; their unlocks arrive in later milestones.
export const TIERS: Tier[] = [
  { id: 'server_closet', name: 'Server closet', minLevel: 1, description: 'Power and heat basics' },
  { id: 'small_hosting', name: 'Small hosting company', minLevel: 6, description: 'Customers and contracts' },
  { id: 'regional_dc', name: 'Regional datacentre', minLevel: 13, description: 'Reliability and people' },
  { id: 'enterprise', name: 'Enterprise', minLevel: 21, description: 'Scale and competition' },
  { id: 'hyperscale', name: 'Hyperscale', minLevel: 31, description: 'Optimisation and prestige' },
  { id: 'global_network', name: 'Global network', minLevel: 41, description: 'Running datacentres across the world' },
];
