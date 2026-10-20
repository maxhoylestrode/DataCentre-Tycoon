import { describe, expect, it } from 'vitest';
import { type BuildingKind, buildingDef, CONFIG } from '../src/config';
import {
  applyForCertification,
  placeBuilding,
  refurbishMany,
  repairMany,
  rotateMany,
  sellMany,
  upgradeMaxMany,
} from '../src/sim/commands';
import { certStatus, certification, compliancePayBonus, dailyCompliance, stepCompliance } from '../src/sim/compliance';
import { availableCustomerTypes, rollOffer } from '../src/sim/contractBoard';
import { canTakeOffer } from '../src/sim/contracts';
import { CUSTOMER_TYPES } from '../src/sim/content/customers';
import { DECOR_SETS } from '../src/sim/content/decorSets';
import { prestigeOf } from '../src/sim/prestige';
import { totalXpForLevel } from '../src/sim/progression';
import { deserialize, serialize } from '../src/sim/save';
import { createInitialState, type GameState, getBuildingAt } from '../src/sim/state';

const DAY = CONFIG.time.ticksPerDay;

// A level 25 company with enough firewalls and reputation for ISO 27001.
function secureCompany(): GameState {
  const s = createInitialState(12, 12);
  s.progress.xp = totalXpForLevel(25);
  s.cash = 5_000_000;
  s.reputation = 70;
  for (const x of [0, 1]) {
    placeBuilding(s, 'firewall', x, 0);
    const fw = getBuildingAt(s, x, 0)!;
    fw.status = 'ok';
    fw.upgrade = 10;
  }
  return s;
}

const iso = certification('iso_27001')!;

describe('compliance', () => {
  it('an audit charges the fee and passes a day later if the requirements are met', () => {
    const s = secureCompany();
    const cash = s.cash;
    expect(applyForCertification(s, 'iso_27001').ok).toBe(true);
    expect(s.cash).toBe(cash - iso.fee);
    expect(certStatus(s, iso, 25)).toBe('auditing');
    // Only one audit at a time.
    expect(applyForCertification(s, 'soc2')).toEqual({ ok: false, reason: 'busy' });
    s.tick += CONFIG.compliance.auditDays * DAY;
    stepCompliance(s);
    expect(certStatus(s, iso, 25)).toBe('held');
    expect(s.compliance.log.at(-1)!.good).toBe(true);
  });

  it('a failed audit keeps the fee and says what was missing', () => {
    const s = secureCompany();
    s.reputation = 40;
    applyForCertification(s, 'iso_27001');
    s.tick += DAY;
    stepCompliance(s);
    expect(s.compliance.held).toEqual([]);
    expect(s.compliance.log.at(-1)!.text).toContain('Reputation');
  });

  it('is locked by level and by prerequisites', () => {
    const s = secureCompany();
    s.progress.xp = totalXpForLevel(20);
    expect(applyForCertification(s, 'iso_27001')).toEqual({ ok: false, reason: 'locked' });
    s.progress.xp = totalXpForLevel(30);
    expect(applyForCertification(s, 'tier_4')).toEqual({ ok: false, reason: 'locked_requires' });
  });

  it('a missing requirement puts it at risk, then revokes it after the grace days', () => {
    const s = secureCompany();
    s.liveWorld = true;
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: null });
    s.reputation = 40;
    s.tick = DAY;
    dailyCompliance(s);
    expect(certStatus(s, iso, 25)).toBe('at_risk');
    s.tick += CONFIG.compliance.graceDays * DAY;
    dailyCompliance(s);
    expect(s.compliance.held).toEqual([]);
    expect(s.reputation).toBeLessThan(40);
  });

  it('fixing it in time clears the risk', () => {
    const s = secureCompany();
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: null });
    s.reputation = 40;
    s.tick = DAY;
    dailyCompliance(s);
    s.reputation = 70;
    s.tick += DAY;
    dailyCompliance(s);
    expect(certStatus(s, iso, 25)).toBe('held');
  });

  it('renewals cost a share of the fee every few days', () => {
    const s = secureCompany();
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: null });
    const cash = s.cash;
    s.tick = CONFIG.compliance.renewEveryDays * DAY;
    dailyCompliance(s);
    expect(s.cash).toBe(cash - Math.round(iso.fee * CONFIG.compliance.renewFraction));
  });

  it('revoking breaks contracts with clients who need it', () => {
    const s = secureCompany();
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: s.tick - 10 * DAY });
    const bank = CUSTOMER_TYPES.find((t) => t.id === 'bank')!;
    const terms = rollOffer(s, bank);
    expect(terms.certifications).toEqual(['iso_27001']);
    s.contracts.active.push({ ...terms, startTick: 0, endTick: 10 * DAY, servedRackTicks: 0, promisedRackTicks: 0 });
    s.reputation = 40;
    s.tick = 10 * DAY;
    dailyCompliance(s);
    expect(s.contracts.active).toEqual([]);
    expect(s.contracts.history.at(-1)!.outcome).toBe('failed');
  });

  it('certified clients only come, and only sign, while you hold the certification', () => {
    expect(availableCustomerTypes(30).some((t) => t.certifications)).toBe(false);
    expect(availableCustomerTypes(30, ['iso_27001']).some((t) => t.id === 'bank')).toBe(true);
    const s = secureCompany();
    const offer = rollOffer(s, CUSTOMER_TYPES.find((t) => t.id === 'bank')!);
    placeBuilding(s, 'rack_basic', 0, 4);
    // Only the certification stands in the way.
    offer.racks = 1;
    offer.requirement = undefined;
    expect(canTakeOffer(s, offer)).toBe(false);
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: null });
    expect(canTakeOffer(s, offer)).toBe(true);
  });

  it('held certifications add contract pay', () => {
    const s = secureCompany();
    expect(compliancePayBonus(s)).toBe(0);
    s.compliance.held.push({ id: 'iso_27001', since: 0, atRiskSince: null });
    expect(compliancePayBonus(s)).toBe(iso.payBonus);
  });

  it('survives a save and load', () => {
    const s = secureCompany();
    s.compliance.held.push({ id: 'iso_27001', since: 5, atRiskSince: 9 });
    s.compliance.audit = { id: 'soc2', endTick: 99 };
    s.compliance.log.push({ tick: 1, text: 'hello', good: true });
    const loaded = deserialize(serialize(s));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.compliance).toEqual(s.compliance);
  });
});

describe('decor sets', () => {
  it('a complete set adds its prestige on top of the items', () => {
    const s = createInitialState(12, 12);
    s.progress.xp = totalXpForLevel(20);
    s.cash = 1_000_000;
    const set = DECOR_SETS.find((d) => d.id === 'set_lounge')!;
    set.items.forEach((kind, i) => {
      placeBuilding(s, kind as Parameters<typeof placeBuilding>[1], i, 0);
      getBuildingAt(s, i, 0)!.status = 'ok';
    });
    const items = set.items.reduce((sum, k) => sum + (buildingDef(k as BuildingKind).prestige ?? 0), 0);
    const styles = prestigeOf(createInitialState(12, 12));
    expect(prestigeOf(s)).toBe(items + set.prestige + styles);
  });
});

describe('selection commands', () => {
  function racks(): GameState {
    const s = createInitialState(12, 12);
    s.progress.xp = totalXpForLevel(15);
    s.cash = 1_000_000;
    for (let x = 0; x < 4; x++) {
      placeBuilding(s, 'rack_basic', x, 0);
      getBuildingAt(s, x, 0)!.status = 'ok';
    }
    return s;
  }

  it('sellMany sells only the selected buildings', () => {
    const s = racks();
    const ids = s.buildings.slice(0, 2).map((b) => b.id);
    expect(sellMany(s, ids)).toBe(2);
    expect(s.buildings).toHaveLength(2);
    expect(s.buildings.some((b) => ids.includes(b.id))).toBe(false);
  });

  it('rotateMany turns each selected building', () => {
    const s = racks();
    expect(rotateMany(s, [s.buildings[0]!.id])).toBe(1);
    expect(s.buildings[0]!.rot).toBe(1);
    expect(s.buildings[1]!.rot).toBe(0);
  });

  it('upgradeMaxMany upgrades only the selected racks', () => {
    const s = racks();
    expect(upgradeMaxMany(s, [s.buildings[0]!.id])).toBeGreaterThan(0);
    expect(Object.keys(s.buildings[0]!.parts).length).toBeGreaterThan(0);
    expect(s.buildings[1]!.parts).toEqual({});
  });

  it('repairMany and refurbishMany only touch the selection', () => {
    const s = racks();
    s.buildings[0]!.status = 'failed';
    s.buildings[1]!.status = 'failed';
    expect(repairMany(s, [s.buildings[0]!.id])).toBe(1);
    expect(s.buildings[1]!.status).toBe('failed');
    expect(refurbishMany(s, [s.buildings[2]!.id])).toBe(0); // brand new: not worn
  });
});
