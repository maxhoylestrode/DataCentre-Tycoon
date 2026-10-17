import { buildingDef, CONFIG, type PartSlot } from '../config';
import {
  type BuildingStats,
  buildingStats,
  installedPart,
  investedValue,
  nextPart,
  partContribution,
  partCost,
  ageFactor,
  buildTicks,
  chillerCapacity,
  chillerRange,
  isOverdue,
  rackBandwidth,
  rackCores,
  rackTier,
  refurbishCost,
  slotsOf,
} from '../sim/buildings';
import { attackMbps, ddosBlocked } from '../sim/events';
import { formatMbps, uplinkOf } from '../sim/network';
import { backupPower, multiblockOf } from '../sim/power';
import { endOfLifeChance, rackAgeDays } from '../sim/pressure';
import { firewallFilterMbps, firewallShare, upsBackupKw } from '../sim/safety';
import { planUpgradeMax, upgradeUnit } from '../sim/commands';
import { SLOT_NAMES, TRADEMARK_NOTE } from '../sim/content/parts';
import type { Part } from '../sim/content/types';
import { repairCost } from '../sim/economy';
import { feedVents } from '../sim/floor';
import { isUnlocked, levelOf, unlockFor, upgradeCap } from '../sim/progression';
import { type BatteryMode, type Building, categoryOf, type GameState, tempAt } from '../sim/state';
import { kw, num } from './format';

export interface BuildingPanelHandlers {
  onUpgrade(buildingId: number): void;
  onUpgradePart(buildingId: number, slot: PartSlot): void;
  onUpgradeMax(buildingId: number): void;
  onSell(buildingId: number): void;
  onRepair(buildingId: number): void;
  onRotate(buildingId: number): void;
  onMove(buildingId: number): void;
  onRefurbish(buildingId: number): void;
  onBatteryMode(mode: BatteryMode): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
const perMin = (n: number): string => `£${n.toFixed(2)}/min`;

interface StatRow {
  label: string;
  value: (s: BuildingStats) => string;
}

// Which numbers matter for each kind of building.
const ROWS: Record<string, StatRow[]> = {
  rack: [
    { label: 'Income at full', value: (s) => perMin(s.income) },
    { label: 'Power draw', value: (s) => kw(s.powerDraw) },
    { label: 'Heat output', value: (s) => num(s.heat, 2) },
  ],
  power: [{ label: 'Power supply', value: (s) => kw(s.powerSupply) }],
  cooling: [
    { label: 'Cooling power', value: (s) => num(s.coolingStrength * 100) },
    { label: 'Area', value: (s) => (s.coolingRadius > 20 ? 'Whole room' : `${s.coolingRadius * 2 + 1}×${s.coolingRadius * 2 + 1} tiles`) },
    { label: 'Power draw', value: (s) => kw(s.powerDraw) },
  ],
  chiller: [{ label: 'Power draw', value: (s) => kw(s.powerDraw) }],
  decor: [{ label: 'Prestige', value: (s) => `+${s.prestige}` }],
  furniture: [],
};

// Details for the building you clicked: stats, upgrades (part slots for
// racks, levels for power and cooling), Repair and Sell.
export class BuildingPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private buildingId: number | null = null;
  private confirmSell = false;
  private lastHtml = '';

  constructor(parent: HTMLElement, handlers: BuildingPanelHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'building-panel';
    this.root.innerHTML = `<button class="close" data-act="close">✕</button><div class="body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.body') as HTMLElement;

    // pointerdown, not click: the body re-renders as live numbers change, and a
    // button replaced between press and release would never get a click.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled || this.buildingId === null) return;
      const id = this.buildingId;
      const act = button.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'upgrade') handlers.onUpgrade(id);
      else if (act === 'part') handlers.onUpgradePart(id, button.dataset.slot as PartSlot);
      else if (act === 'max') handlers.onUpgradeMax(id);
      else if (act === 'repair') handlers.onRepair(id);
      else if (act === 'rotate') handlers.onRotate(id);
      else if (act === 'move') handlers.onMove(id);
      else if (act === 'refurbish') handlers.onRefurbish(id);
      else if (act === 'battery') handlers.onBatteryMode(button.dataset.mode as BatteryMode);
      else if (act === 'sell') {
        if (this.confirmSell) {
          handlers.onSell(id);
          this.close();
        } else {
          this.confirmSell = true;
        }
      }
      this.lastHtml = '';
    });
  }

  show(buildingId: number): void {
    this.buildingId = buildingId;
    this.confirmSell = false;
    this.lastHtml = '';
    this.root.classList.add('open');
  }

  close(): void {
    this.buildingId = null;
    this.root.classList.remove('open');
  }

  // Returns the selected building (or null), closing the panel if it's gone.
  update(state: GameState): Building | null {
    if (this.buildingId === null) return null;
    const building = state.buildings.find((b) => b.id === this.buildingId);
    if (!building) {
      this.close();
      return null;
    }
    const html = this.render(state, building);
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.body.innerHTML = html;
    }
    return building;
  }

  private render(state: GameState, b: Building): string {
    const def = buildingDef(b.kind);
    const category = categoryOf(b);
    const isRack = slotsOf(b).length > 0;
    const levelled = !isRack && def.upgrade.output > 0;
    const max = CONFIG.upgrades.maxLevel;
    const now = buildingStats(b);
    const next = levelled && b.upgrade < max ? buildingStats(b, b.upgrade + 1) : null;

    const rows = (ROWS[category] ?? [])
      .map((r) => {
        const after = next && r.value(next) !== r.value(now) ? ` <span class="up">→ ${r.value(next)}</span>` : '';
        return `<tr><td>${r.label}</td><td>${r.value(now)}${after}</td></tr>`;
      })
      .join('');

    const statusText =
      b.status === 'failed' ? '<span class="bad">Failed</span>'
      : b.status === 'repairing' ? `<span class="muted">${b.repairDoneTick === null ? 'Waiting for an engineer to repair' : 'Under repair'}</span>`
      : b.status === 'building' ? `<span class="warn">Under construction · ${Math.round((1 - b.buildRemaining / buildTicks(b.kind)) * 100)}%</span>`
      : '<span class="good">Working</span>';

    // A multiblock shows (and upgrades) its lowest member's level.
    const shownLevel = levelled ? upgradeUnit(state, b).level : 0;
    const levelLine = levelled
      ? ` <span class="muted">${multiblockOf(state, b) ? 'block ' : ''}level ${shownLevel} / ${max}</span>
         <div class="pips">${Array.from({ length: max }, (_, i) => `<span class="${i < shownLevel ? 'on' : ''}"></span>`).join('')}</div>`
      : '';

    const extra =
      category === 'chiller' ? this.chillerInfo(state, b)
      : isRack ? this.rackInfo(state, b)
      : category === 'power' ? this.powerInfo(state, b)
      : category === 'safety' ? this.safetyInfo(state, b)
      : def.zone ? `<div class="muted">Works on a ${def.zone} room zone (Zones menu).</div>`
      : '';

    return `
      <h2>${def.name}${levelLine}</h2>
      <div>${statusText} &middot; <span class="muted">${tempAt(state, b.x, b.y).toFixed(1)}°C</span></div>
      <table>${rows}</table>
      ${extra}
      ${isRack || levelled ? this.maxButton(state, b) : ''}
      ${isRack ? this.partSlots(state, b) : ''}
      ${levelled ? this.upgradeButton(state, b, upgradeCap(state)) : ''}
      ${b.status === 'failed' ? `<button data-act="repair" ${state.cash < repairCost(b) ? 'disabled' : ''}>Repair (${money(repairCost(b))})</button>` : ''}
      <button data-act="rotate" title="Rotate (Q while placing)">⟳ Rotate</button>
      <button data-act="move" title="Pick it up and place it somewhere else (M)">✥ Move</button>
      <button data-act="sell" class="danger">${this.confirmSell ? `Click again to sell for ${money(investedValue(b) * CONFIG.economy.sellRefund)}` : 'Sell'}</button>
      ${isRack ? `<div class="fine">${TRADEMARK_NOTE}</div>` : ''}`;
  }

  // Buys every upgrade it can: up to the level cap, or until the money runs out.
  private maxButton(state: GameState, b: Building): string {
    if (!isUnlocked(state, 'upgrades')) return '';
    const plan = planUpgradeMax(state, b.x, b.y);
    const n = plan.steps.length;
    if (n === 0) return `<button class="max-btn" disabled>Upgrade max: nothing more right now</button>`;
    return `<button data-act="max" class="primary max-btn">⏫ Upgrade max &middot; ${n} upgrade${n > 1 ? 's' : ''} &middot; ${money(plan.cost)}</button>`;
  }

  private powerInfo(state: GameState, b: Building): string {
    const def = buildingDef(b.kind);
    const lines: string[] = [];
    const block = multiblockOf(state, b);
    if (block) {
      const supply = block.reduce((sum, m) => sum + buildingStats(m).powerSupply, 0) * (1 + CONFIG.multiblock.bonus);
      lines.push(`<div class="good">Part of a power multiblock: +${CONFIG.multiblock.bonus * 100}% output, ${kw(supply)} from all four. The block upgrades as one.</div>`);
    } else {
      lines.push(`<div class="muted">Tip: four ${def.name.toLowerCase()}s in a 2×2 square produce ${CONFIG.multiblock.bonus * 100}% more.</div>`);
    }
    if (def.renewable) lines.push('<div class="good">Renewable: its power is free, so it comes off your electricity bill.</div>');
    else if (def.gridFed) lines.push('<div class="muted">Grid-fed: loses most of its output in a power cut. UPS batteries cover it.</div>');
    else lines.push('<div class="muted">On-site generator: keeps running in a power cut.</div>');
    return lines.join('');
  }

  private safetyInfo(state: GameState, b: Building): string {
    const def = buildingDef(b.kind);
    const atMax = b.upgrade >= CONFIG.upgrades.maxLevel;
    const row = (label: string, now: string, next: string): string =>
      `<table><tr><td>${label}</td><td>${now}${!atMax && next !== now ? ` <span class="up">→ ${next}</span>` : ''}</td></tr></table>`;
    if (def.backupKw) {
      const mode = state.battery.mode;
      const modes = state.liveWorld
        ? `<div class="rack-row"><span>Charge <b>${Math.round(state.battery.charge * 100)}%</b></span></div>
           <div class="seg">
             <button data-act="battery" data-mode="save" class="${mode === 'save' ? 'on' : ''}" title="Charge on cheap night power, cover the evening peak">Save money</button>
             <button data-act="battery" data-mode="reserve" class="${mode === 'reserve' ? 'on' : ''}" title="Stay full, ready for power cuts">Keep for outages</button>
           </div>
           <div class="muted">${mode === 'save'
             ? 'Charging at night and covering the evening peak to cut your bill. A power cut late in the evening may find them low.'
             : 'Kept full, ready for any power cut.'}</div>`
        : '';
      return (
        row('Backup power', kw(upsBackupKw(b)), kw(upsBackupKw(b, b.upgrade + 1))) +
        `<div class="muted">Covers lost grid power during a power cut while there's charge. All your UPS banks add up: ${kw(backupPower(state))} in total. Upgrades add more.</div>` +
        modes
      );
    }
    if (def.suppressionRadius) {
      const size = def.suppressionRadius * 2 + 1;
      return `<div class="muted">Puts out fires in racks within a ${size}×${size} area around it.</div>`;
    }
    const attack = attackMbps(state);
    const share = (level: number): string => `${Math.round(firewallShare(b, attack, level) * 100)}%`;
    return (
      row('Filters', formatMbps(firewallFilterMbps(b)), formatMbps(firewallFilterMbps(b, b.upgrade + 1))) +
      row('Blocks of an attack', share(b.upgrade), share(b.upgrade + 1)) +
      `<div class="muted">An attack on your ${formatMbps(uplinkOf(state).mbps)} line would be about ${formatMbps(attack)}. ` +
      `Each firewall blocks up to ${CONFIG.safety.firewallMaxShare * 100}%, and they add up: yours block <b>${Math.round(ddosBlocked(state) * 100)}%</b> together. ` +
      'Bigger lines need upgraded firewalls, or more of them.</div>'
    );
  }

  private chillerInfo(state: GameState, b: Building): string {
    const load = feedVents(state).load.get(b.id) ?? 0;
    return `<div class="muted">Feeding ${load} / ${chillerCapacity(b)} floor vents within ${chillerRange(b)} tiles. Upgrades feed more.</div>`;
  }

  // Specs, hardware age (with Refurbish) and servicing.
  private rackInfo(state: GameState, b: Building): string {
    const lines = [`<div class="muted">${rackCores(b)} CPU cores &middot; tier ${rackTier(b)} &middot; ${formatMbps(rackBandwidth(b))} bandwidth</div>`];
    const age = ageFactor(state, b);
    const days = Math.floor((state.tick - b.refreshedAtTick) / CONFIG.time.ticksPerDay);
    if (b.status === 'ok') {
      const cost = refurbishCost(b);
      const ageClass = age < 0.8 ? 'bad' : age < 0.95 ? 'warn' : 'good';
      lines.push(
        `<div class="rack-row"><span>Hardware age <b class="${ageClass}">${days} days · earning ${Math.round(age * 100)}%</b></span>` +
          (age < 1 ? `<button data-act="refurbish" ${state.cash < cost ? 'disabled' : ''}>Refurbish ${money(cost)}</button>` : '') +
          '</div>',
      );
    }
    if (state.liveWorld) {
      const left = CONFIG.pressure.endOfLifeDays - rackAgeDays(state, b.refreshedAtTick);
      const risk = endOfLifeChance(state, b.refreshedAtTick);
      lines.push(
        risk > 0
          ? `<div class="rack-row"><span>End of life <b class="bad">${Math.round(risk * 24 * 100)}% chance a day of failing</b></span></div>`
          : `<div class="rack-row"><span>End of life <b class="${left < 10 ? 'warn' : 'good'}">in ${Math.ceil(left)} days</b></span></div>`,
      );
    }
    if (state.staffSim && b.status === 'ok') {
      const since = Math.max(0, (state.tick - b.lastServicedTick) / CONFIG.time.ticksPerDay);
      const overdue = isOverdue(state, b);
      lines.push(
        `<div class="rack-row"><span>Serviced <b class="${overdue ? 'bad' : 'good'}">${since.toFixed(1)} days ago${overdue ? ' · overdue, earning less' : ''}</b></span></div>`,
      );
    }
    return lines.join('');
  }

  private partSlots(state: GameState, b: Building): string {
    const unlocked = isUnlocked(state, 'upgrades');
    const level = levelOf(state);
    const rows = slotsOf(b).map((slot) => {
      const part = installedPart(b, slot);
      const upcoming = nextPart(b, slot);
      return `
        <div class="slot">
          <div class="slot-head"><b>${SLOT_NAMES[slot]}</b> <span class="muted">${part ? this.partLabel(part) : ''}</span></div>
          ${part ? `<div class="muted">${part.specs}${this.partEffect(b, part)}</div>` : ''}
          ${this.partButton(state, b, slot, upcoming, unlocked, level)}
        </div>`;
    });
    return `<div class="slots">${rows.join('')}</div>`;
  }

  private partLabel(part: Part): string {
    return `${part.brand} ${part.model}`;
  }

  private partEffect(b: Building, part: Part): string {
    if (part.heatReduction) return '';
    const { income } = partContribution(b, part);
    return income > 0 ? ` &middot; <span class="good">+${perMin(income)}</span>` : '';
  }

  private partButton(state: GameState, b: Building, slot: PartSlot, part: Part | null, unlocked: boolean, level: number): string {
    if (!part) return '<div class="muted">Best part installed.</div>';
    const name = this.partLabel(part);
    if (!unlocked) return `<div class="muted">Upgrades unlock at level ${unlockFor('upgrades')?.level ?? '?'}.</div>`;
    if (part.level > level) return `<div class="muted">Next: ${name} at level ${part.level}</div>`;

    const cost = partCost(b, part);
    const current = installedPart(b, slot);
    const gain = part.heatReduction
      ? `-${Math.round(part.heatReduction * 100)}% rack heat`
      : `+${perMin(partContribution(b, part).income - (current ? partContribution(b, current).income : 0))}`;
    const reason = b.status !== 'ok' ? 'Repair it first.' : state.cash < cost ? `Need ${money(cost)}.` : '';
    return `
      <button data-act="part" data-slot="${slot}" class="primary" ${reason ? 'disabled' : ''}>
        → ${name} (${part.specs}) <b>${gain}</b> &middot; ${money(cost)}
      </button>`;
  }

  private upgradeButton(state: GameState, b: Building, cap: number): string {
    const unit = upgradeUnit(state, b);
    const block = multiblockOf(state, b) !== null;
    if (unit.level >= CONFIG.upgrades.maxLevel) return `<div class="muted">${block ? 'Multiblock fully' : 'Fully'} upgraded.</div>`;
    if (!isUnlocked(state, 'upgrades')) {
      return `<div class="muted">Upgrades unlock at level ${unlockFor('upgrades')?.level ?? '?'}.</div>`;
    }
    let reason = '';
    if (unit.level >= cap) reason = `Reach level ${unit.level + 1} to upgrade further.`;
    else if (unit.members.some((m) => m.status !== 'ok')) reason = block ? 'Every unit in the block must be working.' : 'Repair it first.';
    else if (state.cash < unit.cost) reason = `Need ${money(unit.cost)}.`;
    const label = block
      ? unit.members.length < 4 ? `Even out the block: ${unit.members.length} to level ${unit.level + 1}` : `Upgrade the whole block to level ${unit.level + 1}`
      : `Upgrade to level ${unit.level + 1}`;
    return `
      <button data-act="upgrade" class="primary" ${reason ? 'disabled' : ''}>${label} (${money(unit.cost)})</button>
      ${reason ? `<div class="muted">${reason}</div>` : ''}`;
  }
}
