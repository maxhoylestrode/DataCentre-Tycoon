import type { Certification } from './types';

// Industry certifications (Compliance panel, from the 'compliance' mechanic).
// Apply and pay the fee; the audit reports a day later and passes if every
// requirement is met then. While held, a daily check keeps watching: a
// missing requirement puts it at risk, and still missing after the grace
// days it's revoked (CONFIG.compliance). Clients that need a certification
// (content/customers.ts) only visit while you hold it.
//
// Requirements are goal conditions (sim/conditions.ts). Fractions are 0..1.
export const CERTIFICATIONS: Certification[] = [
  {
    id: 'iso_27001',
    name: 'ISO 27001',
    description: 'Information security. Banks won\'t talk to you without it.',
    level: 21,
    fee: 250_000,
    payBonus: 0.03,
    requires: [],
    requirements: [
      { label: 'Firewalls block 60% of a cyber attack', condition: { type: 'firewallBlock', min: 0.6 } },
      { label: 'Reputation 55 or more', condition: { type: 'reputation', min: 55 } },
    ],
  },
  {
    id: 'soc2',
    name: 'SOC 2',
    description: 'Proof your operations are run properly. Healthcare clients ask for it.',
    level: 22,
    fee: 400_000,
    payBonus: 0.03,
    requires: [],
    requirements: [
      { label: '99% uptime over the last 3 days', condition: { type: 'recentUptime', min: 0.99, days: 3 } },
      { label: '3 technicians on staff', condition: { type: 'staffCount', role: 'technician', min: 3 } },
    ],
  },
  {
    id: 'green_energy',
    name: 'Green energy certified',
    description: 'A real share of your power from renewables. Climate funds only host green.',
    level: 24,
    fee: 350_000,
    payBonus: 0.02,
    requires: [],
    requirements: [
      { label: '30% of power drawn comes from renewables', condition: { type: 'renewableShare', min: 0.3 } },
    ],
  },
  {
    id: 'tier_3',
    name: 'Uptime Tier III',
    description: 'Concurrently maintainable: backup power and fire protection everywhere. Governments need it.',
    level: 25,
    fee: 600_000,
    payBonus: 0.04,
    requires: [],
    requirements: [
      { label: 'UPS backup covers 50% of power draw', condition: { type: 'upsCoverage', min: 0.5 } },
      { label: 'Fire suppression covers 90% of racks', condition: { type: 'suppressionCoverage', min: 0.9 } },
      { label: '99.5% uptime over the last 7 days', condition: { type: 'recentUptime', min: 0.995, days: 7 } },
    ],
  },
  {
    id: 'tier_4',
    name: 'Uptime Tier IV',
    description: 'Fault tolerant: nothing single can take you down. Stock exchanges host nowhere else.',
    level: 28,
    fee: 1_200_000,
    payBonus: 0.05,
    requires: ['tier_3'],
    requirements: [
      { label: 'UPS backup covers all of your power draw', condition: { type: 'upsCoverage', min: 1 } },
      { label: 'Fire suppression covers every rack', condition: { type: 'suppressionCoverage', min: 1 } },
      { label: 'Firewalls block 90% of a cyber attack', condition: { type: 'firewallBlock', min: 0.9 } },
      { label: '99.9% uptime over the last 7 days', condition: { type: 'recentUptime', min: 0.999, days: 7 } },
    ],
  },
];
