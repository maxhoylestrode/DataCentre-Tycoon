// Late-game balance guard: a scripted player (tests/bot.ts) plays a full
// game with every system on. It must never go bankrupt, and once the
// business is established its profit margin must stay under the target,
// so money can't pile up unchecked again. If tuning breaks this, the game
// has become either too punishing or too easy.

import { describe, expect, it } from 'vitest';
import { playBot } from './bot';

const DAYS = 30;
// Real datacentres run at about 20-30%; the game allows a bit more early on.
const TARGET_MARGIN = 0.4;
// Margins are only judged once the business is established (contracts
// running, past the fast early growth).
const FROM_DAY = 12;
// The live world (overhead, tax, end of life) squeezes big companies: by
// this day margins must have come down to LATE_MARGIN.
const LATE_DAY = 20;
const LATE_MARGIN = 0.25;

describe('late-game balance', () => {
  const reports = playBot(DAYS);

  it('a sensible player never goes bankrupt', () => {
    console.table(reports.map((r) => ({ ...r, income: r.income.toFixed(1), costs: r.costs.toFixed(1), margin: `${Math.round(r.margin * 100)}%` })));
    expect(reports.some((r) => r.day === -1)).toBe(false);
    expect(reports).toHaveLength(DAYS);
  });

  it('is still growing: income rises over the game', () => {
    expect(reports.at(-1)!.income).toBeGreaterThan(reports[FROM_DAY]!.income);
  });

  it(`keeps the profit margin under ${TARGET_MARGIN * 100}% once established`, () => {
    const late = reports.filter((r) => r.day >= FROM_DAY);
    const worst = Math.max(...late.map((r) => r.margin));
    expect(worst).toBeLessThan(TARGET_MARGIN);
  });

  it(`gets harder late on: margins under ${LATE_MARGIN * 100}% from day ${LATE_DAY}`, () => {
    const late = reports.filter((r) => r.day >= LATE_DAY);
    expect(Math.max(...late.map((r) => r.margin))).toBeLessThan(LATE_MARGIN);
  });
}, 300_000);
