import { CONFIG, type Speed } from '../config';
import type { ToolPreview } from '../input/tools';
import { committedRacks } from '../sim/contracts';
import { costsPerTick, incomePerTick, repairCost } from '../sim/economy';
import { powerDraw, powerEfficiency, powerSupply } from '../sim/power';
import { prestigeOf } from '../sim/prestige';
import { levelInfo, tierFor } from '../sim/progression';
import { type GameState, racksOf, tempAt } from '../sim/state';
import type { Tile } from '../render/grid';

export interface HudHandlers {
  onTogglePause(): void;
  onSetSpeed(speed: Speed): void;
  onRestart(): void;
}

const money = (n: number): string => `${n < 0 ? '-' : ''}£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;

function clockText(tick: number): string {
  const { ticksPerDay } = CONFIG.time;
  const day = Math.floor(tick / ticksPerDay) + 1;
  const minute = tick % ticksPerDay;
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `Day ${day} &middot; ${hh}:${mm}`;
}

function warnings(state: GameState): string[] {
  const out: string[] = [];
  const efficiency = powerEfficiency(state);
  if (efficiency < 1) {
    out.push(`<span class="bad">Power overloaded: everything running at ${Math.floor(efficiency * 100)}%. Build a power unit.</span>`);
  }
  const racks = racksOf(state);
  const failed = racks.filter((r) => r.status === 'failed');
  const repairing = racks.filter((r) => r.status === 'repairing').length;
  const hot = racks.filter((r) => r.status === 'ok' && tempAt(state, r.x, r.y) > CONFIG.heat.warnTemp).length;
  if (failed.length > 0) {
    const n = failed.length;
    out.push(`<span class="bad">${n} rack${n > 1 ? 's' : ''} failed. Click with a build tool to repair (${money(repairCost(failed[0]!))} each).</span>`);
  }
  if (hot > 0) {
    out.push(`<span class="warn">${hot} rack${hot > 1 ? 's' : ''} running hot (over ${CONFIG.heat.warnTemp}°C, fail at ${CONFIG.heat.failTemp}°C).</span>`);
  }
  if (repairing > 0) out.push(`<span class="muted">${repairing} rack${repairing > 1 ? 's' : ''} under repair.</span>`);

  const promised = committedRacks(state);
  const working = racks.filter((r) => r.status === 'ok').length;
  if (working < promised) {
    out.push(`<span class="bad">Contracts need ${promised} working racks, you have ${working}: uptime is dropping.</span>`);
  }
  return out;
}

export class Hud {
  private readonly levelText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly net: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly prestige: HTMLElement;
  private readonly powerText: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly info: HTMLElement;
  private readonly warnings: HTMLElement;
  private readonly speedButtons = new Map<Speed | 'pause', HTMLButtonElement>();
  private readonly bankruptPanel: HTMLElement;
  private readonly bankruptText: HTMLElement;
  private lastText = '';

  constructor(parent: HTMLElement, handlers: HudHandlers) {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <h1>Datacentre Tycoon</h1>
      <div class="level"><div class="level-text"></div><div class="bar xp"><div class="xp-fill"></div></div></div>
      <div class="cash"></div>
      <div class="net"></div>
      <div class="clock"></div>
      <div class="prestige muted"></div>
      <div class="controls"></div>
      <div class="power"><div class="power-text"></div><div class="bar"><div class="fill"></div></div></div>
      <div class="info"></div>
      <div class="warnings"></div>
      <div class="muted">Drag or WASD: pan &middot; Wheel: zoom<br>Space: pause &middot; 1/2/3: speed</div>
    `;
    parent.appendChild(root);
    const q = (sel: string): HTMLElement => root.querySelector(sel) as HTMLElement;
    this.levelText = q('.level-text');
    this.xpFill = q('.xp-fill');
    this.cash = q('.cash');
    this.net = q('.net');
    this.clock = q('.clock');
    this.prestige = q('.prestige');
    this.powerText = q('.power-text');
    this.powerFill = q('.fill');
    this.info = q('.info');
    this.warnings = q('.warnings');

    const controls = q('.controls');
    const addButton = (key: Speed | 'pause', label: string, onClick: () => void): void => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        onClick();
        // Keep keyboard shortcuts (Space) from re-triggering the focused button.
        button.blur();
      });
      controls.appendChild(button);
      this.speedButtons.set(key, button);
    };
    addButton('pause', '❚❚', handlers.onTogglePause);
    for (const speed of CONFIG.time.speeds) addButton(speed, `${speed}x`, () => handlers.onSetSpeed(speed));

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
    const income = incomePerTick(state);
    const costs = costsPerTick(state);
    const net = income - costs;
    const supply = powerSupply(state);
    const draw = powerDraw(state);
    const temp = hover ? tempAt(state, hover.x, hover.y) : null;
    const warningList = warnings(state);
    const level = levelInfo(state.progress.xp);
    const prestige = prestigeOf(state);

    const text = [
      state.progress.xp,
      prestige,
      money(state.cash), income.toFixed(2), costs.toFixed(2), state.tick, supply, draw,
      temp?.toFixed(1), preview?.text, state.paused, state.speed, state.bankrupt, warningList.join(),
    ].join('|');
    if (text === this.lastText) return;
    this.lastText = text;

    this.levelText.innerHTML =
      `Level <b>${level.level}</b> &middot; ${tierFor(level.level).name} ` +
      `<span class="muted">(${Math.floor(level.xpIntoLevel)} / ${level.xpForNext} XP)</span>`;
    this.xpFill.style.width = `${(level.xpIntoLevel / level.xpForNext) * 100}%`;

    this.cash.innerHTML = `Cash: <b>${money(state.cash)}</b>`;
    this.cash.classList.toggle('negative', state.cash < 0);
    this.net.innerHTML =
      `Net: ${net >= 0 ? '+' : '-'}£${Math.abs(net).toFixed(2)} / min ` +
      `<span class="muted">(in £${income.toFixed(2)}, out £${costs.toFixed(2)})</span>`;
    this.net.classList.toggle('negative', net < 0);
    this.clock.innerHTML = clockText(state.tick);
    this.prestige.textContent = prestige > 0 ? `Prestige ${prestige}` : '';

    const load = supply > 0 ? draw / supply : 1;
    this.powerText.innerHTML = `Power: ${draw} / ${supply} kW`;
    this.powerFill.style.width = `${Math.min(100, load * 100)}%`;
    this.powerFill.className = `fill ${load > 1 ? 'over' : load > 0.85 ? 'high' : ''}`;

    const tempText = temp === null ? '' : ` <span class="muted">&middot; ${temp.toFixed(1)}°C</span>`;
    this.info.innerHTML = (preview?.text ?? '&nbsp;') + tempText;
    this.warnings.innerHTML = warningList.map((w) => `<div>${w}</div>`).join('');

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
