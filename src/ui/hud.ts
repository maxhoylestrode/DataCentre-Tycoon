import { CONFIG, type Speed } from '../config';
import type { ToolPreview } from '../input/tools';
import { isOverdue } from '../sim/buildings';
import { contractBoardOpen } from '../sim/contractBoard';
import { committedRacks } from '../sim/contracts';
import { costBreakdown, incomeBreakdown, repairCost } from '../sim/economy';
import { bandwidthDemand, formatMbps, networkEfficiency, uplinkOf } from '../sim/network';
import { receptionProblem, staffSpeedFactor } from '../sim/people';
import { powerDraw, powerEfficiency, powerSupply } from '../sim/power';
import { prestigeOf } from '../sim/prestige';
import { levelInfo, tierFor } from '../sim/progression';
import { type GameState, racksOf, tempAt } from '../sim/state';
import type { Tile } from '../render/grid';
import { num } from './format';
import { ICONS } from './icons';

export interface HudHandlers {
  onTogglePause(): void;
  onSetSpeed(speed: Speed): void;
  onRestart(): void;
  onOpenNetwork(): void;
}

const money = (n: number): string => `${n < 0 ? '-' : ''}£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;
const perMin = (n: number): string => `£${n.toFixed(2)}`;

function clockText(tick: number): string {
  const { ticksPerDay } = CONFIG.time;
  const day = Math.floor(tick / ticksPerDay) + 1;
  const minute = tick % ticksPerDay;
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `Day ${day} &middot; ${hh}:${mm}`;
}

interface Warning {
  level: 'bad' | 'warn' | 'info';
  text: string;
}

function warnings(state: GameState): Warning[] {
  const out: Warning[] = [];
  const power = powerEfficiency(state);
  if (power < 1) out.push({ level: 'bad', text: `Power overloaded: running at ${Math.floor(power * 100)}%. Build power units.` });
  const net = networkEfficiency(state);
  if (net < 1) out.push({ level: 'bad', text: `Internet line full: running at ${Math.floor(net * 100)}%. Upgrade it (click Network).` });

  const racks = racksOf(state);
  const failed = racks.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    out.push({ level: 'bad', text: `${failed.length} rack${failed.length > 1 ? 's' : ''} failed: click with a build tool to repair (${money(repairCost(failed[0]!))}).` });
  }
  const hot = racks.filter((r) => r.status === 'ok' && tempAt(state, r.x, r.y) > CONFIG.heat.warnTemp).length;
  if (hot > 0) out.push({ level: 'warn', text: `${hot} rack${hot > 1 ? 's' : ''} running hot (fail at ${CONFIG.heat.failTemp}°C).` });

  const promised = committedRacks(state);
  const working = racks.filter((r) => r.status === 'ok').length;
  if (working < promised) out.push({ level: 'bad', text: `Contracts need ${promised} working racks, you have ${working}.` });

  if (state.staffSim) {
    const overdue = racks.filter((r) => isOverdue(state, r)).length;
    if (overdue > 0) out.push({ level: 'warn', text: `${overdue} rack${overdue > 1 ? 's' : ''} overdue for servicing: hire a technician.` });
    if (staffSpeedFactor(state) < 1) out.push({ level: 'warn', text: 'Staff are tired: build a bigger staff room.' });
    const waiting = state.buildings.filter((b) => b.status === 'building').length;
    if (waiting > 0) out.push({ level: 'info', text: `${waiting} building${waiting > 1 ? 's' : ''} waiting for an engineer.` });
    if (contractBoardOpen(state)) {
      const problem = receptionProblem(state);
      if (problem) out.push({ level: 'warn', text: problem });
    }
  }
  return out;
}

export class Hud {
  private readonly speedButtons = new Map<Speed | 'pause', HTMLButtonElement>();
  private readonly parts: Record<string, HTMLElement> = {};
  private readonly bankruptPanel: HTMLElement;
  private readonly bankruptText: HTMLElement;
  private lastText = '';

  constructor(parent: HTMLElement, handlers: HudHandlers) {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-top"><span class="hud-title">Datacentre Tycoon</span><span class="hud-level"></span></div>
      <div class="bar xp"><div class="xp-fill"></div></div>
      <div class="hud-money">
        <div class="hud-cash"></div>
        <div class="hud-net interactive" tabindex="0"><span class="hud-net-value"></span><div class="hud-breakdown"></div></div>
      </div>
      <div class="hud-time"><span class="hud-clock"></span><div class="hud-speed interactive"></div></div>
      <div class="hud-meter"><span class="hud-meter-icon">${ICONS.power}</span><div class="hud-meter-body"><div class="hud-meter-label hud-power-text"></div><div class="bar"><div class="fill hud-power-fill"></div></div></div></div>
      <button class="hud-meter interactive hud-network" title="Internet line: click to upgrade"><span class="hud-meter-icon">${ICONS.network}</span><div class="hud-meter-body"><div class="hud-meter-label hud-net-text"></div><div class="bar"><div class="fill hud-net-fill"></div></div></div></button>
      <div class="hud-chips"></div>
      <div class="hud-info"></div>
      <div class="hud-warnings"></div>`;
    parent.appendChild(root);
    for (const key of ['hud-level', 'xp-fill', 'hud-cash', 'hud-net-value', 'hud-breakdown', 'hud-clock', 'hud-power-text', 'hud-power-fill', 'hud-net-text', 'hud-net-fill', 'hud-chips', 'hud-info', 'hud-warnings']) {
      this.parts[key] = root.querySelector(`.${key}`) as HTMLElement;
    }
    (root.querySelector('.hud-network') as HTMLElement).addEventListener('pointerdown', (e) => {
      if (e.button === 0) handlers.onOpenNetwork();
    });

    const speed = root.querySelector('.hud-speed') as HTMLElement;
    const addButton = (key: Speed | 'pause', label: string, onClick: () => void): void => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('pointerdown', (e) => {
        if (e.button === 0) onClick();
      });
      speed.appendChild(button);
      this.speedButtons.set(key, button);
    };
    addButton('pause', '❚❚', handlers.onTogglePause);
    for (const s of CONFIG.time.speeds) addButton(s, `${s}x`, () => handlers.onSetSpeed(s));

    this.bankruptPanel = document.createElement('div');
    this.bankruptPanel.className = 'bankrupt';
    this.bankruptPanel.innerHTML = `
      <div class="panel">
        <h2>Bankrupt</h2>
        <p class="summary"></p>
        <button>Start again</button>
      </div>
    `;
    parent.appendChild(this.bankruptPanel);
    this.bankruptText = this.bankruptPanel.querySelector('.summary') as HTMLElement;
    (this.bankruptPanel.querySelector('button') as HTMLButtonElement).addEventListener('click', handlers.onRestart);
  }

  update(state: GameState, hover: Tile | null, preview: ToolPreview | null): void {
    const income = incomeBreakdown(state);
    const totalIn = income.walkIn + income.contracts;
    const costs = costBreakdown(state);
    const net = totalIn - costs.total;
    const supply = powerSupply(state);
    const draw = powerDraw(state);
    const line = uplinkOf(state);
    const demand = bandwidthDemand(state);
    const temp = hover ? tempAt(state, hover.x, hover.y) : null;
    const warningList = warnings(state);
    const level = levelInfo(state.progress.xp);
    const prestige = prestigeOf(state);

    const text = [
      state.progress.xp, prestige, money(state.cash), totalIn.toFixed(2), costs.total.toFixed(2), state.tick,
      num(supply), num(draw), Math.round(demand), line.id, temp?.toFixed(1), preview?.text, state.paused, state.speed,
      state.bankrupt, state.staff.length, income.market.toFixed(2), warningList.map((w) => w.text).join(),
    ].join('|');
    if (text === this.lastText) return;
    this.lastText = text;
    const p = this.parts;

    p['hud-level']!.innerHTML = `<b>Lv ${level.level}</b> ${tierFor(level.level).name} <span class="muted">${Math.floor(level.xpIntoLevel)}/${level.xpForNext} XP</span>`;
    p['xp-fill']!.style.width = `${(level.xpIntoLevel / level.xpForNext) * 100}%`;
    p['hud-cash']!.textContent = money(state.cash);
    p['hud-cash']!.classList.toggle('negative', state.cash < 0);
    p['hud-net-value']!.innerHTML = `${net >= 0 ? '+' : '-'}${perMin(Math.abs(net))}<small>/min</small>`;
    p['hud-net-value']!.className = `hud-net-value ${net >= 0 ? 'good' : 'bad'}`;
    p['hud-breakdown']!.innerHTML = `
      <div><span>Walk-in</span><b class="good">+${perMin(income.walkIn)}</b></div>
      <div><span>Contracts</span><b class="good">+${perMin(income.contracts)}</b></div>
      <div><span>Rent</span><b class="bad">-${perMin(costs.rent)}</b></div>
      <div><span>Upkeep</span><b class="bad">-${perMin(costs.upkeep)}</b></div>
      <div><span>Electricity</span><b class="bad">-${perMin(costs.electricity)}</b></div>
      <div><span>Internet</span><b class="bad">-${perMin(costs.network)}</b></div>
      <div><span>Wages</span><b class="bad">-${perMin(costs.wages)}</b></div>`;
    p['hud-clock']!.innerHTML = clockText(state.tick);

    const load = supply > 0 ? draw / supply : 1;
    p['hud-power-text']!.innerHTML = `<span>Power</span><b>${num(draw)} / ${num(supply)} kW</b>`;
    p['hud-power-fill']!.style.width = `${Math.min(100, load * 100)}%`;
    p['hud-power-fill']!.className = `fill hud-power-fill ${load > 1 ? 'over' : load > 0.85 ? 'high' : ''}`;
    const netLoad = demand / line.mbps;
    p['hud-net-text']!.innerHTML = `<span>Network</span><b>${formatMbps(demand)} / ${formatMbps(line.mbps)}</b>`;
    p['hud-net-fill']!.style.width = `${Math.min(100, netLoad * 100)}%`;
    p['hud-net-fill']!.className = `fill hud-net-fill ${netLoad > 1 ? 'over' : netLoad > 0.85 ? 'high' : ''}`;

    const chips: string[] = [];
    if (prestige > 0) chips.push(`<span class="hud-chip">✦ Prestige ${prestige}</span>`);
    if (state.staffSim) chips.push(`<span class="hud-chip">${ICONS.staff} ${state.staff.length} staff</span>`);
    if (income.market < 1) chips.push(`<span class="hud-chip warn" title="Walk-in customers are running out: contracts don't count">Market ${Math.round(income.market * 100)}%</span>`);
    p['hud-chips']!.innerHTML = chips.join('');

    const tempText = temp === null ? '' : ` <span class="muted">&middot; ${temp.toFixed(1)}°C</span>`;
    p['hud-info']!.innerHTML = preview ? preview.text + tempText : tempText || '&nbsp;';
    p['hud-warnings']!.innerHTML = warningList.map((w) => `<div class="hud-warn ${w.level}">${w.text}</div>`).join('');

    for (const [key, button] of this.speedButtons) {
      const active = key === 'pause' ? state.paused : !state.paused && state.speed === key;
      button.classList.toggle('active', active);
    }

    this.bankruptPanel.classList.toggle('visible', state.bankrupt);
    if (state.bankrupt) {
      this.bankruptText.innerHTML = `You ran out of money on ${clockText(state.tick)} with ${racksOf(state).length} racks.`;
    }
  }
}
