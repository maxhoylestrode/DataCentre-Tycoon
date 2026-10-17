import { CONFIG } from '../config';
import { EVENT_NAMES } from '../sim/events';
import { formatMbps } from '../sim/network';
import type { GameState, HistorySample } from '../sim/state';
import { clockText, num } from './format';
import { ICONS } from './icons';

// The statistics screen, laid out like a city builder's: a sidebar of every
// tracked stat, grouped by category, each with its latest value and trend.
// Tick stats to plot them together on the big graph; hover the graph to
// read exact values. Overview cards and cost / income breakdowns sit around it.

type Range = 'day' | 'week' | 'all';
const RANGE_SAMPLES: Record<Range, number> = { day: 24, week: 24 * 7, all: Infinity };
const RANGE_LABELS: Record<Range, string> = { day: '24 hours', week: '7 days', all: 'All time' };

type Unit = 'perMin' | 'money' | 'kw' | 'mbps' | 'pct' | 'temp' | 'count';

interface StatDef {
  id: string;
  label: string;
  colour: string;
  unit: Unit;
  get: (s: HistorySample) => number | undefined;
  // Whether going up is good (green trend) or bad (red). Undefined: neutral.
  upIsGood?: boolean;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  stats: StatDef[];
}

const pct = (v: number | undefined): number | undefined => (v === undefined ? undefined : v * 100);
const diff = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined || b === undefined ? undefined : a - b;

const CATEGORIES: Category[] = [
  {
    id: 'money', label: 'Finances', icon: '£', stats: [
      { id: 'cash', label: 'Bank balance', colour: '#ffd23a', unit: 'money', get: (s) => s.cash, upIsGood: true },
      { id: 'net', label: 'Profit', colour: '#4aa8ff', unit: 'perMin', get: (s) => diff(s.income, s.costs), upIsGood: true },
      { id: 'income', label: 'Total income', colour: '#4cc38a', unit: 'perMin', get: (s) => s.income, upIsGood: true },
      { id: 'costs', label: 'Total costs', colour: '#ff7a7f', unit: 'perMin', get: (s) => s.costs, upIsGood: false },
    ],
  },
  {
    id: 'income', label: 'Income', icon: '↗', stats: [
      { id: 'walkIn', label: 'Walk-in customers', colour: '#7fe0a8', unit: 'perMin', get: (s) => s.walkIn, upIsGood: true },
      { id: 'contracts', label: 'Contracts', colour: '#3fd0c9', unit: 'perMin', get: (s) => s.contracts, upIsGood: true },
      { id: 'market', label: 'Market demand', colour: '#a6e36b', unit: 'pct', get: (s) => pct(s.market), upIsGood: true },
      { id: 'uptime', label: 'Uptime', colour: '#5ee0a0', unit: 'pct', get: (s) => pct(s.uptime), upIsGood: true },
    ],
  },
  {
    id: 'costs', label: 'Expenses', icon: '↘', stats: [
      { id: 'electricity', label: 'Electricity', colour: '#ffb02e', unit: 'perMin', get: (s) => s.electricity, upIsGood: false },
      { id: 'wages', label: 'Staff wages', colour: '#ff8fb1', unit: 'perMin', get: (s) => s.wages, upIsGood: false },
      { id: 'upkeep', label: 'Building upkeep', colour: '#c58cff', unit: 'perMin', get: (s) => s.upkeep, upIsGood: false },
      { id: 'rent', label: 'Rent', colour: '#ff6b5b', unit: 'perMin', get: (s) => s.rent, upIsGood: false },
      { id: 'networkCost', label: 'Internet line', colour: '#6fb8ff', unit: 'perMin', get: (s) => s.network, upIsGood: false },
    ],
  },
  {
    id: 'power', label: 'Power', icon: '⚡', stats: [
      { id: 'powerSupply', label: 'Supply', colour: '#ffd23a', unit: 'kw', get: (s) => s.powerSupply },
      { id: 'powerDraw', label: 'Draw', colour: '#ff8a2a', unit: 'kw', get: (s) => s.powerDraw },
      { id: 'headroom', label: 'Spare capacity', colour: '#e8f06b', unit: 'kw', get: (s) => diff(s.powerSupply, s.powerDraw), upIsGood: true },
      { id: 'powerEff', label: 'Power efficiency', colour: '#ffe07a', unit: 'pct', get: (s) => pct(s.powerEff), upIsGood: true },
    ],
  },
  {
    id: 'network', label: 'Internet', icon: '⇅', stats: [
      { id: 'bandwidth', label: 'Bandwidth used', colour: '#4aa8ff', unit: 'mbps', get: (s) => s.bandwidth },
      { id: 'lineCapacity', label: 'Line capacity', colour: '#9fd0ff', unit: 'mbps', get: (s) => s.lineCapacity },
      { id: 'networkEff', label: 'Network efficiency', colour: '#5bc6ff', unit: 'pct', get: (s) => pct(s.networkEff), upIsGood: true },
    ],
  },
  {
    id: 'heat', label: 'Temperature', icon: '🌡', stats: [
      { id: 'avgTemp', label: 'Average rack', colour: '#ff9f5a', unit: 'temp', get: (s) => s.avgTemp, upIsGood: false },
      { id: 'maxTemp', label: 'Hottest rack', colour: '#ff4d5e', unit: 'temp', get: (s) => s.maxTemp, upIsGood: false },
    ],
  },
  {
    id: 'racks', label: 'Infrastructure', icon: '▤', stats: [
      { id: 'racks', label: 'Racks', colour: '#c3b8ff', unit: 'count', get: (s) => s.racks, upIsGood: true },
      { id: 'racksRunning', label: 'Racks running', colour: '#8f7cff', unit: 'count', get: (s) => s.racksRunning, upIsGood: true },
      { id: 'racksContracted', label: 'Racks on contract', colour: '#3fd0c9', unit: 'count', get: (s) => s.racksContracted },
      { id: 'racksFailed', label: 'Racks down', colour: '#ff5a5f', unit: 'count', get: (s) => s.racksFailed, upIsGood: false },
      { id: 'buildings', label: 'All buildings', colour: '#b6c2d1', unit: 'count', get: (s) => s.buildings },
    ],
  },
  {
    id: 'people', label: 'People', icon: '☺', stats: [
      { id: 'staff', label: 'Staff', colour: '#ff8fb1', unit: 'count', get: (s) => s.staff },
      { id: 'engineers', label: 'Engineers', colour: '#ffb347', unit: 'count', get: (s) => s.engineers },
      { id: 'technicians', label: 'Technicians', colour: '#7fd1ff', unit: 'count', get: (s) => s.technicians },
      { id: 'activeContracts', label: 'Active contracts', colour: '#3fd0c9', unit: 'count', get: (s) => s.activeContracts, upIsGood: true },
      { id: 'clientsWaiting', label: 'Clients visiting', colour: '#e0e6ee', unit: 'count', get: (s) => s.clientsWaiting },
    ],
  },
  {
    id: 'company', label: 'Company', icon: '★', stats: [
      { id: 'level', label: 'Level', colour: '#b28cff', unit: 'count', get: (s) => s.level, upIsGood: true },
      { id: 'xp', label: 'Experience', colour: '#8f7cff', unit: 'count', get: (s) => s.xp, upIsGood: true },
      { id: 'prestige', label: 'Prestige', colour: '#ffd23a', unit: 'count', get: (s) => s.prestige, upIsGood: true },
      { id: 'researchDone', label: 'Research done', colour: '#5ee0a0', unit: 'count', get: (s) => s.researchDone, upIsGood: true },
    ],
  },
];

const STATS = new Map(CATEGORIES.flatMap((c) => c.stats.map((s) => [s.id, s] as const)));

function money(n: number): string {
  const abs = Math.abs(n);
  const s =
    abs >= 1e9 ? `£${num(abs / 1e9, 2)}bn`
    : abs >= 1e6 ? `£${num(abs / 1e6, 2)}m`
    : abs >= 1e4 ? `£${num(abs / 1e3, 1)}k`
    : `£${abs.toFixed(abs < 10 ? 2 : 0)}`;
  return n < 0 ? `-${s}` : s;
}

function bigCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${num(n / 1e6, 2)}m`;
  if (abs >= 1e4) return `${num(n / 1e3, 1)}k`;
  return num(n, abs < 10 ? 1 : 0);
}

function fmt(unit: Unit, v: number): string {
  switch (unit) {
    case 'perMin': return `${money(v)}/min`;
    case 'money': return money(v);
    case 'kw': return `${bigCount(v)} kW`;
    case 'mbps': return v < 0 ? `-${formatMbps(-v)}` : formatMbps(v);
    case 'pct': return `${num(v, 0)}%`;
    case 'temp': return `${num(v, 1)}°C`;
    case 'count': return bigCount(v);
  }
}

// Shorter labels for the graph's axis.
function axisFmt(unit: Unit, v: number): string {
  return unit === 'perMin' ? money(v) : fmt(unit, v);
}

interface Series {
  def: StatDef;
  values: (number | undefined)[];
}

const W_MIN = 320;
const H = 260;
const PAD = { l: 64, r: 14, t: 14, b: 26 };

// Range of the values, padded a little, including zero for money flows.
function extent(values: number[], unit: Unit): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (unit !== 'temp' && unit !== 'pct') min = Math.min(0, min);
  if (unit === 'pct') {
    min = Math.min(min, 0);
    max = Math.max(max, 100);
  }
  if (max - min < 1e-6) max = min + 1;
  const span = max - min;
  return [min - (min === 0 ? 0 : span * 0.06), max + span * 0.08];
}

export class StatsPanel {
  private readonly root: HTMLElement;
  private readonly side: HTMLElement;
  private readonly main: HTMLElement;
  private readonly tabs: HTMLElement;
  private range: Range = 'week';
  private selected = new Set<string>(['income', 'costs', 'net']);
  private collapsed = new Set<string>();
  private lastKey = '';
  private samples: HistorySample[] = [];
  private series: Series[] = [];
  private chartWidth = 640;
  // Last cursor position over the graph, to keep the tooltip through redraws.
  private pointer: { clientX: number; clientY: number } | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel stats-panel';
    this.root.innerHTML = `
      <div class="ct-head sx-head">${ICONS.stats}<h2>Statistics</h2>
        <div class="sx-tabs"></div>
        <button data-act="close" aria-label="Close">✕</button></div>
      <div class="sx-layout"><aside class="sx-side"></aside><section class="sx-main"></section></div>`;
    parent.appendChild(this.root);
    this.side = this.root.querySelector('.sx-side') as HTMLElement;
    this.main = this.root.querySelector('.sx-main') as HTMLElement;
    this.tabs = this.root.querySelector('.sx-tabs') as HTMLElement;

    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-range], [data-stat], [data-cat], [data-solo]');
      if (!el) return;
      if (el.dataset.act === 'close') return this.toggle(false);
      if (el.dataset.act === 'clear') this.selected.clear();
      if (el.dataset.range) this.range = el.dataset.range as Range;
      if (el.dataset.stat) {
        const id = el.dataset.stat;
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
      }
      // Overview cards and breakdown rows show just that one stat.
      if (el.dataset.solo) this.selected = new Set([el.dataset.solo]);
      if (el.dataset.cat) {
        const id = el.dataset.cat;
        if (this.collapsed.has(id)) this.collapsed.delete(id);
        else this.collapsed.add(id);
      }
      this.lastKey = '';
    });
    this.main.addEventListener('pointermove', (e) => {
      this.pointer = { clientX: e.clientX, clientY: e.clientY };
      this.hover(this.pointer);
    });
    this.main.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.hover(null);
    });
    // Redraw at the new width when the window changes size.
    new ResizeObserver(() => (this.lastKey = '')).observe(this.main);
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.lastKey = '';
  }

  update(state: GameState): void {
    if (!this.open) return;
    // Only redraw when a new sample arrives or the view changes.
    const width = Math.max(W_MIN, Math.floor(this.main.clientWidth - 26));
    const key = [
      state.history.samples.length, state.history.samples.at(-1)?.tick, this.range, [...this.selected].join(','),
      [...this.collapsed].join(','), state.events.history.length, width,
    ].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.chartWidth = width;
    this.samples = state.history.samples.slice(-RANGE_SAMPLES[this.range]);
    this.series = [...this.selected]
      .map((id) => STATS.get(id))
      .filter((d): d is StatDef => d !== undefined)
      .map((def) => ({ def, values: this.samples.map(def.get) }));

    this.tabs.innerHTML = (Object.keys(RANGE_LABELS) as Range[])
      .map((r) => `<button data-range="${r}" class="${r === this.range ? 'active' : ''}">${RANGE_LABELS[r]}</button>`)
      .join('');
    this.side.innerHTML = this.sidebar();
    this.main.innerHTML = `
      ${this.overview(state)}
      <div class="sx-card sx-chart-card">
        <div class="sx-chart-head">
          <div class="sx-legend">${this.legend()}</div>
          ${this.series.length ? '<button data-act="clear" class="sx-clear">Clear</button>' : ''}
        </div>
        <div class="sx-chart">${this.chart()}<div class="sx-tip"></div></div>
      </div>
      <div class="sx-split">
        ${this.breakdown('Income sources', 'income', ['walkIn', 'contracts'])}
        ${this.breakdown('Where the money goes', 'costs', ['electricity', 'wages', 'upkeep', 'rent', 'networkCost'])}
      </div>
      ${this.records(state)}
      ${this.incidents(state)}`;
    this.hover(this.pointer);
  }

  // Newest and oldest values of a stat in the range. Samples from older saves
  // may not have it, so skip those.
  private lastKnown(def: StatDef): number | undefined {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const v = def.get(this.samples[i]!);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  private firstKnown(def: StatDef): number | undefined {
    for (const s of this.samples) {
      const v = def.get(s);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  // --- Sidebar ---------------------------------------------------------------

  private sidebar(): string {
    return CATEGORIES.map((cat) => {
      const open = !this.collapsed.has(cat.id);
      const on = cat.stats.filter((s) => this.selected.has(s.id)).length;
      const rows = open
        ? cat.stats.map((s) => {
            const v = this.lastKnown(s);
            const was = this.firstKnown(s);
            const active = this.selected.has(s.id);
            return `
              <button class="sx-stat ${active ? 'on' : ''}" data-stat="${s.id}" style="--c:${s.colour}">
                <i class="sx-check"></i>
                <span class="sx-name">${s.label}</span>
                <span class="sx-val">${v === undefined ? '–' : fmt(s.unit, v)}${this.trend(s, was, v)}</span>
              </button>`;
          }).join('')
        : '';
      return `
        <div class="sx-cat ${open ? 'open' : ''}">
          <button class="sx-cat-head" data-cat="${cat.id}">
            <span class="sx-cat-icon">${cat.icon}</span>${cat.label}
            ${on ? `<span class="sx-count">${on}</span>` : ''}<span class="sx-caret">▾</span>
          </button>
          ${rows}
        </div>`;
    }).join('');
  }

  // A small ▲ / ▼ with the change over the visible range.
  private trend(s: StatDef, was: number | undefined, now: number | undefined): string {
    if (was === undefined || now === undefined || this.samples.length < 2) return '';
    const change = now - was;
    const scale = Math.max(Math.abs(was), Math.abs(now), 1e-9);
    if (Math.abs(change) / scale < 0.01) return '<em class="sx-trend flat">•</em>';
    const up = change > 0;
    const tone = s.upIsGood === undefined ? 'flat' : up === s.upIsGood ? 'good' : 'bad';
    const rel = Math.abs(was) > 1e-9 && s.unit !== 'pct' && s.unit !== 'temp' ? ` ${num(Math.min(999, Math.abs(change / was) * 100), 0)}%` : '';
    return `<em class="sx-trend ${tone}">${up ? '▲' : '▼'}${rel}</em>`;
  }

  // --- Overview cards ------------------------------------------------------

  private overview(state: GameState): string {
    const cards = ['cash', 'net', 'uptime', 'racksRunning', 'powerDraw', 'maxTemp'];
    const latest = this.samples.at(-1);
    return `<div class="sx-kpis">${cards.map((id) => {
      const def = STATS.get(id)!;
      const values = this.samples.map(def.get).filter((v): v is number => v !== undefined);
      const v = this.lastKnown(def);
      let extra = '';
      if (id === 'powerDraw' && latest?.powerSupply !== undefined) extra = `<small>of ${fmt('kw', latest.powerSupply)}</small>`;
      if (id === 'racksRunning' && latest?.racks !== undefined) extra = `<small>of ${latest.racks}</small>`;
      if (id === 'cash') extra = `<small>${clockText(state.tick)}</small>`;
      return `
        <button class="sx-kpi ${this.selected.has(id) && this.selected.size === 1 ? 'on' : ''}" data-solo="${id}" style="--c:${def.colour}">
          <span class="sx-kpi-label">${def.label}</span>
          <span class="sx-kpi-value">${v === undefined ? '–' : fmt(def.unit, v)}</span>
          ${extra}
          ${this.sparkline(values, def.colour)}
        </button>`;
    }).join('')}</div>`;
  }

  private sparkline(values: number[], colour: string): string {
    if (values.length < 2) return '<svg class="sx-spark"></svg>';
    const w = 100;
    const h = 26;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="sx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polygon points="0,${h} ${pts} ${w},${h}" fill="${colour}" fill-opacity="0.14"/>
      <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // --- The big graph -----------------------------------------------------------

  private legend(): string {
    if (this.series.length === 0) return '<span class="muted">Tick stats on the left to plot them here.</span>';
    return this.series
      .map(({ def }) => `<button class="sx-chip" data-stat="${def.id}" style="--c:${def.colour}"><i></i>${def.label}<span>✕</span></button>`)
      .join('');
  }

  // Lines share one axis when they share a unit; with mixed units each line
  // is scaled to fit and the axis shows the first one's values.
  private scales(): { min: number; max: number }[] {
    const units = new Set(this.series.map((s) => s.def.unit));
    const known = (s: Series): number[] => s.values.filter((v): v is number => v !== undefined);
    if (units.size === 1) {
      const all = this.series.flatMap(known);
      const [min, max] = all.length ? extent(all, this.series[0]!.def.unit) : [0, 1];
      return this.series.map(() => ({ min, max }));
    }
    return this.series.map((s) => {
      const vals = known(s);
      const [min, max] = vals.length ? extent(vals, s.def.unit) : [0, 1];
      return { min, max };
    });
  }

  private chart(): string {
    const n = this.samples.length;
    if (this.series.length === 0) return `<div class="sx-empty">Nothing selected.</div>`;
    if (n < 2) return `<div class="sx-empty">Not enough data yet: the graph adds a point every game hour.</div>`;
    const W = this.chartWidth;
    const scales = this.scales();
    const mixed = new Set(this.series.map((s) => s.def.unit)).size > 1;
    const x = (i: number): number => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number, k: number): number => {
      const { min, max } = scales[k]!;
      return PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
    };

    // Horizontal grid with values of the first series' scale.
    const first = this.series[0]!;
    const { min, max } = scales[0]!;
    const grid = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)
      .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v, 0)}" y2="${y(v, 0)}" class="sx-grid"/>
        <text x="${PAD.l - 8}" y="${y(v, 0) + 3.5}" text-anchor="end">${mixed ? '' : axisFmt(first.def.unit, v)}</text>`)
      .join('');
    const zero = !mixed && min < 0 && max > 0
      ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0, 0)}" y2="${y(0, 0)}" class="sx-zero"/>` : '';

    // Time labels along the bottom.
    const marks = Math.min(6, n);
    const times = Array.from({ length: marks }, (_, i) => Math.round((i * (n - 1)) / (marks - 1)))
      .map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${clockText(this.samples[i]!.tick).replace(' &middot; ', ' ')}</text>`)
      .join('');

    const lines = this.series.map((s, k) => {
      // Split at missing values (samples from older saves).
      const runs: string[][] = [[]];
      s.values.forEach((v, i) => {
        if (v === undefined) runs.push([]);
        else runs.at(-1)!.push(`${x(i).toFixed(1)},${y(v, k).toFixed(1)}`);
      });
      const base = y(Math.max(scales[k]!.min, 0), k);
      return runs.filter((r) => r.length > 1).map((pts) => {
        const area = this.series.length <= 2
          ? `<polygon points="${pts[0]!.split(',')[0]},${base} ${pts.join(' ')} ${pts.at(-1)!.split(',')[0]},${base}" fill="url(#sx-g${k})"/>` : '';
        return `${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${s.def.colour}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }).join('');
    }).join('');
    const gradients = this.series.map((s, k) => `
      <linearGradient id="sx-g${k}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${s.def.colour}" stop-opacity="0.28"/><stop offset="1" stop-color="${s.def.colour}" stop-opacity="0"/>
      </linearGradient>`).join('');

    const note = mixed ? `<text x="${PAD.l}" y="${PAD.t - 2}" class="sx-note">Mixed units: each line is scaled to fit</text>` : '';
    return `<svg class="sx-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${gradients}</defs>${grid}${zero}${times}${lines}${note}
      <line class="sx-cursor" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/>
      ${this.series.map((s, k) => `<circle class="sx-dot" data-k="${k}" r="4" fill="${s.def.colour}" visibility="hidden"/>`).join('')}
    </svg>`;
  }

  // Hovering the graph shows a cursor line and every value at that hour.
  private hover(e: { clientX: number; clientY: number } | null): void {
    const svg = this.main.querySelector<SVGSVGElement>('.sx-svg');
    const tip = this.main.querySelector<HTMLElement>('.sx-tip');
    if (!svg || !tip) return;
    const cursor = svg.querySelector('.sx-cursor')!;
    const dots = svg.querySelectorAll<SVGCircleElement>('.sx-dot');
    const rect = svg.getBoundingClientRect();
    const n = this.samples.length;
    const inside = e && e.clientX >= rect.left + PAD.l && e.clientX <= rect.right - PAD.r && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!e || !inside || n < 2) {
      cursor.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      tip.style.display = 'none';
      return;
    }
    const W = this.chartWidth;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))));
    const cx = PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
    cursor.setAttribute('x1', String(cx));
    cursor.setAttribute('x2', String(cx));
    cursor.setAttribute('visibility', 'visible');
    const scales = this.scales();
    const rows: string[] = [];
    this.series.forEach((s, k) => {
      const v = s.values[i];
      const dot = dots[k];
      if (v === undefined || !dot) {
        dot?.setAttribute('visibility', 'hidden');
        return;
      }
      const { min, max } = scales[k]!;
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)));
      dot.setAttribute('visibility', 'visible');
      rows.push(`<div><i style="background:${s.def.colour}"></i>${s.def.label}<b>${fmt(s.def.unit, v)}</b></div>`);
    });
    tip.innerHTML = `<div class="sx-tip-time">${clockText(this.samples[i]!.tick)}</div>${rows.join('')}`;
    tip.style.display = 'block';
    const left = (cx / W) * rect.width;
    tip.style.left = `${left > rect.width / 2 ? left - tip.offsetWidth - 12 : left + 12}px`;
  }

  // --- Breakdowns, records and incidents ------------------------------------------

  // Average share of each part over the visible range, as a stacked bar and a list.
  private breakdown(title: string, totalId: string, ids: string[]): string {
    const parts = ids.map((id) => {
      const def = STATS.get(id)!;
      const vals = this.samples.map(def.get).filter((v): v is number => v !== undefined);
      return { def, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    });
    const total = parts.reduce((s, p) => s + p.avg, 0);
    const totalDef = STATS.get(totalId)!;
    if (total <= 0) {
      return `<div class="sx-card"><div class="sx-card-title">${title}</div><div class="muted">No data yet.</div></div>`;
    }
    const sorted = [...parts].sort((a, b) => b.avg - a.avg);
    const bar = sorted
      .map((p) => `<span style="width:${(p.avg / total) * 100}%;background:${p.def.colour}" title="${p.def.label}"></span>`)
      .join('');
    const rows = sorted
      .map((p) => `
        <button class="sx-brk-row" data-solo="${p.def.id}" style="--c:${p.def.colour}">
          <i></i><span>${p.def.label}</span><b>${fmt('perMin', p.avg)}</b><em>${num((p.avg / total) * 100, 0)}%</em>
        </button>`)
      .join('');
    return `
      <div class="sx-card">
        <div class="sx-card-title">${title}<span>${fmt(totalDef.unit, total)} avg</span></div>
        <div class="sx-bar">${bar}</div>
        ${rows}
      </div>`;
  }

  private records(state: GameState): string {
    const s = state.progress.stats;
    const tiles: [string, string][] = [
      ['Earned in total', money(s.totalEarned)],
      ['Best day', money(s.bestDayProfit)],
      ['Contracts done', String(s.contractsCompleted)],
      ['Contract income', money(s.contractIncome)],
      ['Upgrades bought', String(s.upgrades)],
      ['Rack failures', String(s.failures)],
    ];
    return `
      <div class="sx-card">
        <div class="sx-card-title">Records</div>
        <div class="sx-records">${tiles.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
  }

  private incidents(state: GameState): string {
    const list = state.events.history
      .slice()
      .reverse()
      .map((e) => `<div class="sx-inc"><span class="ct-pill ${e.good ? 'good' : 'bad'}">${EVENT_NAMES[e.kind]}</span><span>${e.text}</span><span class="muted">${clockText(e.tick)}</span></div>`)
      .join('');
    return `
      <div class="sx-card">
        <div class="sx-card-title">Recent incidents<span>last ${CONFIG.events.historyLength}</span></div>
        ${list || '<div class="muted">None yet.</div>'}
      </div>`;
  }
}
