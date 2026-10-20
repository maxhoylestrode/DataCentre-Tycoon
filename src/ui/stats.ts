import { CONFIG } from '../config';
import { EVENT_NAMES } from '../sim/events';
import { formatMbps } from '../sim/network';
import type { GameState, HistorySample } from '../sim/state';
import { clockText, num } from './format';
import { ICONS } from './icons';

// The statistics screen: a sidebar of sections, each with its own page.
// Overview is a simple dashboard (key numbers, profit graph, where the money
// comes from and goes). Each other section shows its own numbers and a few
// focused graphs, one per thing that's worth comparing, so no graph mixes
// units or gets crowded. Hover any graph for exact values.

type Range = 'day' | 'week' | 'all';
const RANGE_SAMPLES: Record<Range, number> = { day: 24, week: 24 * 7, all: Infinity };
const RANGE_LABELS: Record<Range, string> = { day: '24 hours', week: '7 days', all: 'All time' };

type Unit = 'perMin' | 'money' | 'kw' | 'mbps' | 'pct' | 'temp' | 'count';

interface StatDef {
  label: string;
  colour: string;
  unit: Unit;
  get: (s: HistorySample) => number | undefined;
  // Whether going up is good (green trend) or bad (red). Undefined: neutral.
  upIsGood?: boolean;
}

const pct = (v: number | undefined): number | undefined => (v === undefined ? undefined : v * 100);
const diff = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined || b === undefined ? undefined : a - b;

// Every stat the pages can show, by id.
const STATS: Record<string, StatDef> = {
  cash: { label: 'Bank balance', colour: '#ffd23a', unit: 'money', get: (s) => s.cash, upIsGood: true },
  net: { label: 'Profit', colour: '#4aa8ff', unit: 'perMin', get: (s) => diff(s.income, s.costs), upIsGood: true },
  income: { label: 'Income', colour: '#4cc38a', unit: 'perMin', get: (s) => s.income, upIsGood: true },
  costs: { label: 'Costs', colour: '#ff7a7f', unit: 'perMin', get: (s) => s.costs, upIsGood: false },
  walkIn: { label: 'Walk-in customers', colour: '#7fe0a8', unit: 'perMin', get: (s) => s.walkIn, upIsGood: true },
  contracts: { label: 'Contracts', colour: '#3fd0c9', unit: 'perMin', get: (s) => s.contracts, upIsGood: true },
  market: { label: 'Market demand', colour: '#a6e36b', unit: 'pct', get: (s) => pct(s.market), upIsGood: true },
  uptime: { label: 'Uptime', colour: '#5ee0a0', unit: 'pct', get: (s) => pct(s.uptime), upIsGood: true },
  electricity: { label: 'Electricity', colour: '#ffb02e', unit: 'perMin', get: (s) => s.electricity, upIsGood: false },
  wages: { label: 'Staff wages', colour: '#ff8fb1', unit: 'perMin', get: (s) => s.wages, upIsGood: false },
  upkeep: { label: 'Building upkeep', colour: '#c58cff', unit: 'perMin', get: (s) => s.upkeep, upIsGood: false },
  rent: { label: 'Rent', colour: '#ff6b5b', unit: 'perMin', get: (s) => s.rent, upIsGood: false },
  networkCost: { label: 'Internet line', colour: '#6fb8ff', unit: 'perMin', get: (s) => s.network, upIsGood: false },
  overhead: { label: 'Facility overhead', colour: '#d9a066', unit: 'perMin', get: (s) => s.overhead, upIsGood: false },
  tax: { label: 'Corporation tax', colour: '#e05a8a', unit: 'perMin', get: (s) => s.tax, upIsGood: false },
  reputation: { label: 'Reputation', colour: '#ffd23a', unit: 'count', get: (s) => s.reputation, upIsGood: true },
  demand: { label: 'Customer demand', colour: '#7fe0a8', unit: 'pct', get: (s) => pct(s.demand) },
  electricityRate: { label: 'Electricity price', colour: '#ffb02e', unit: 'pct', get: (s) => pct(s.electricityRate), upIsGood: false },
  batteryCharge: { label: 'Battery charge', colour: '#5bc6ff', unit: 'pct', get: (s) => pct(s.batteryCharge) },
  powerSupply: { label: 'Supply', colour: '#ffd23a', unit: 'kw', get: (s) => s.powerSupply },
  powerDraw: { label: 'Draw', colour: '#ff8a2a', unit: 'kw', get: (s) => s.powerDraw },
  headroom: { label: 'Spare power', colour: '#e8f06b', unit: 'kw', get: (s) => diff(s.powerSupply, s.powerDraw), upIsGood: true },
  powerEff: { label: 'Power efficiency', colour: '#ffe07a', unit: 'pct', get: (s) => pct(s.powerEff), upIsGood: true },
  bandwidth: { label: 'Bandwidth used', colour: '#4aa8ff', unit: 'mbps', get: (s) => s.bandwidth },
  lineCapacity: { label: 'Line capacity', colour: '#9fd0ff', unit: 'mbps', get: (s) => s.lineCapacity },
  networkEff: { label: 'Network efficiency', colour: '#5bc6ff', unit: 'pct', get: (s) => pct(s.networkEff), upIsGood: true },
  avgTemp: { label: 'Average rack', colour: '#ff9f5a', unit: 'temp', get: (s) => s.avgTemp, upIsGood: false },
  maxTemp: { label: 'Hottest rack', colour: '#ff4d5e', unit: 'temp', get: (s) => s.maxTemp, upIsGood: false },
  racks: { label: 'Racks', colour: '#c3b8ff', unit: 'count', get: (s) => s.racks, upIsGood: true },
  racksRunning: { label: 'Running', colour: '#8f7cff', unit: 'count', get: (s) => s.racksRunning, upIsGood: true },
  racksContracted: { label: 'On contract', colour: '#3fd0c9', unit: 'count', get: (s) => s.racksContracted },
  racksFailed: { label: 'Racks down', colour: '#ff5a5f', unit: 'count', get: (s) => s.racksFailed, upIsGood: false },
  buildings: { label: 'All buildings', colour: '#b6c2d1', unit: 'count', get: (s) => s.buildings },
  staff: { label: 'Staff', colour: '#ff8fb1', unit: 'count', get: (s) => s.staff },
  engineers: { label: 'Engineers', colour: '#ffb347', unit: 'count', get: (s) => s.engineers },
  technicians: { label: 'Technicians', colour: '#7fd1ff', unit: 'count', get: (s) => s.technicians },
  activeContracts: { label: 'Active contracts', colour: '#3fd0c9', unit: 'count', get: (s) => s.activeContracts, upIsGood: true },
  clientsWaiting: { label: 'Clients visiting', colour: '#e0e6ee', unit: 'count', get: (s) => s.clientsWaiting },
  level: { label: 'Level', colour: '#b28cff', unit: 'count', get: (s) => s.level, upIsGood: true },
  xp: { label: 'Experience', colour: '#8f7cff', unit: 'count', get: (s) => s.xp, upIsGood: true },
  prestige: { label: 'Prestige', colour: '#ffd23a', unit: 'count', get: (s) => s.prestige, upIsGood: true },
  researchDone: { label: 'Research done', colour: '#5ee0a0', unit: 'count', get: (s) => s.researchDone, upIsGood: true },
};

// A graph: stats that share a unit, plotted together. `lines` are fixed
// reference lines (e.g. the temperature racks fail at).
interface ChartDef {
  title: string;
  stats: string[];
  lines?: { value: number; label: string; colour: string }[];
}

type Extra = 'incomeSplit' | 'costSplit' | 'records' | 'incidents';

interface Page {
  id: string;
  label: string;
  icon: string;
  // The value shown beside the page in the sidebar.
  headline: string;
  hint: string;
  // Number tiles at the top; click one to jump to its page.
  tiles: string[];
  charts: ChartDef[];
  extras?: Extra[];
}

const PAGES: Page[] = [
  {
    id: 'overview', label: 'Overview', icon: '◉', headline: 'net',
    hint: 'How the company is doing at a glance. Pick a section on the left for more detail.',
    tiles: ['cash', 'net', 'uptime', 'racksRunning', 'headroom', 'reputation'],
    charts: [{ title: 'Income and costs', stats: ['income', 'costs'] }],
    extras: ['incomeSplit', 'costSplit', 'incidents'],
  },
  {
    id: 'money', label: 'Money', icon: '£', headline: 'cash',
    hint: 'Your bank balance and profit over time.',
    tiles: ['cash', 'net', 'income', 'costs'],
    charts: [{ title: 'Bank balance', stats: ['cash'] }, { title: 'Profit per minute', stats: ['net'] }],
    extras: ['records'],
  },
  {
    id: 'income', label: 'Income', icon: '↗', headline: 'income',
    hint: 'Where your money comes from, and what drives it.',
    tiles: ['walkIn', 'contracts', 'uptime', 'market'],
    charts: [
      { title: 'Income by source', stats: ['walkIn', 'contracts'] },
      { title: 'Uptime and market demand', stats: ['uptime', 'market'] },
    ],
    extras: ['incomeSplit'],
  },
  {
    id: 'costs', label: 'Costs', icon: '↘', headline: 'costs',
    hint: 'Where the money goes. The bar shows each cost\'s share over the time range.',
    tiles: ['costs', 'electricity', 'wages', 'upkeep'],
    charts: [
      { title: 'Running costs', stats: ['electricity', 'wages', 'upkeep'] },
      { title: 'Rent, line, overhead and tax', stats: ['rent', 'networkCost', 'overhead', 'tax'] },
    ],
    extras: ['costSplit'],
  },
  {
    id: 'customers', label: 'Customers', icon: '☆', headline: 'reputation',
    hint: 'Reputation, demand and the clients you serve.',
    tiles: ['reputation', 'demand', 'activeContracts', 'clientsWaiting'],
    charts: [
      { title: 'Reputation', stats: ['reputation'] },
      { title: 'Customer demand', stats: ['demand'] },
      { title: 'Contracts and visitors', stats: ['activeContracts', 'clientsWaiting'] },
    ],
  },
  {
    id: 'power', label: 'Power', icon: '⚡', headline: 'headroom',
    hint: 'Keep supply above draw. Batteries and the price follow the time of day.',
    tiles: ['powerSupply', 'powerDraw', 'headroom', 'powerEff'],
    charts: [
      { title: 'Supply and draw', stats: ['powerSupply', 'powerDraw'] },
      { title: 'Electricity price and battery charge', stats: ['electricityRate', 'batteryCharge'] },
      { title: 'Power efficiency', stats: ['powerEff'] },
    ],
  },
  {
    id: 'network', label: 'Internet', icon: '⇅', headline: 'bandwidth',
    hint: 'Bandwidth against your line. Watch the evening peak.',
    tiles: ['bandwidth', 'lineCapacity', 'networkEff'],
    charts: [
      { title: 'Bandwidth and line', stats: ['bandwidth', 'lineCapacity'] },
      { title: 'Network efficiency', stats: ['networkEff'] },
    ],
  },
  {
    id: 'heat', label: 'Cooling', icon: '❄', headline: 'maxTemp',
    hint: `Racks glow over ${CONFIG.heat.warnTemp}°C and fail over ${CONFIG.heat.failTemp}°C.`,
    tiles: ['avgTemp', 'maxTemp'],
    charts: [{
      title: 'Rack temperatures', stats: ['avgTemp', 'maxTemp'],
      lines: [
        { value: CONFIG.heat.warnTemp, label: 'Warm', colour: '#ffb347' },
        { value: CONFIG.heat.failTemp, label: 'Fails', colour: '#ff5a5f' },
      ],
    }],
  },
  {
    id: 'racks', label: 'Racks', icon: '▤', headline: 'racksRunning',
    hint: 'Your hardware: how many racks, how many working, how many on contract.',
    tiles: ['racks', 'racksRunning', 'racksContracted', 'racksFailed'],
    charts: [
      { title: 'Racks', stats: ['racks', 'racksRunning', 'racksContracted'] },
      { title: 'Racks down', stats: ['racksFailed'] },
      { title: 'All buildings', stats: ['buildings'] },
    ],
  },
  {
    id: 'people', label: 'Staff', icon: '☺', headline: 'staff',
    hint: 'Who works for you.',
    tiles: ['staff', 'engineers', 'technicians'],
    charts: [{ title: 'Staff', stats: ['staff', 'engineers', 'technicians'] }],
  },
  {
    id: 'company', label: 'Company', icon: '★', headline: 'level',
    hint: 'Growth: level, prestige and research.',
    tiles: ['level', 'xp', 'prestige', 'researchDone'],
    charts: [
      { title: 'Level', stats: ['level'] },
      { title: 'Prestige', stats: ['prestige'] },
      { title: 'Research done', stats: ['researchDone'] },
    ],
    extras: ['records'],
  },
  {
    id: 'incidents', label: 'Incidents', icon: '!', headline: '',
    hint: 'Recent good and bad news.',
    tiles: [],
    charts: [],
    extras: ['incidents'],
  },
];

// The page each stat belongs to (its first non-overview page), for tile clicks.
const HOME = new Map<string, string>();
for (const p of PAGES) if (p.id !== 'overview') for (const id of p.tiles) if (!HOME.has(id)) HOME.set(id, p.id);

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

const axisFmt = (unit: Unit, v: number): string => (unit === 'perMin' ? money(v) : fmt(unit, v));

// Range of the values, padded a little, including zero for amounts.
function extent(values: number[], unit: Unit, lines: number[] = []): [number, number] {
  let min = Math.min(...values, ...lines);
  let max = Math.max(...values, ...lines);
  if (unit !== 'temp' && unit !== 'pct') min = Math.min(0, min);
  if (unit === 'pct') {
    min = Math.min(min, 0);
    max = Math.max(max, 100);
  }
  if (max - min < 1e-6) max = min + 1;
  const span = max - min;
  return [min - (min === 0 ? 0 : span * 0.06), max + span * 0.08];
}

interface Series {
  id: string;
  def: StatDef;
  values: (number | undefined)[];
}

// A drawn chart, kept for hovering.
interface DrawnChart {
  series: Series[];
  min: number;
  max: number;
  width: number;
  height: number;
}

const PAD = { l: 60, r: 12, t: 12, b: 24 };
const CHART_MIN = 300;

export class StatsPanel {
  private readonly root: HTMLElement;
  private readonly side: HTMLElement;
  private readonly main: HTMLElement;
  private readonly tabs: HTMLElement;
  private range: Range = 'week';
  private page = 'overview';
  private lastKey = '';
  private samples: HistorySample[] = [];
  private drawn: DrawnChart[] = [];
  // Last cursor over a chart, to keep the tooltip through redraws.
  private pointer: { chart: number; clientX: number } | null = null;

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
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-range], [data-page]');
      if (!el) return;
      if (el.dataset.act === 'close') return this.toggle(false);
      if (el.dataset.range) this.range = el.dataset.range as Range;
      if (el.dataset.page && el.dataset.page !== this.page) {
        this.page = el.dataset.page;
        this.pointer = null;
        this.main.scrollTop = 0;
      }
      this.lastKey = '';
    });
    this.main.addEventListener('pointermove', (e) => {
      const svg = (e.target as Element).closest?.('.sx-svg');
      const chart = svg ? Number((svg as SVGElement).dataset.chart) : -1;
      this.pointer = chart >= 0 ? { chart, clientX: e.clientX } : null;
      this.hover();
    });
    this.main.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.hover();
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
    const width = this.main.clientWidth;
    const key = [
      state.history.samples.length, state.history.samples.at(-1)?.tick, this.range, this.page, state.events.history.length, width,
    ].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.samples = state.history.samples.slice(-RANGE_SAMPLES[this.range]);
    const page = PAGES.find((p) => p.id === this.page) ?? PAGES[0]!;

    this.tabs.innerHTML = (Object.keys(RANGE_LABELS) as Range[])
      .map((r) => `<button data-range="${r}" class="${r === this.range ? 'active' : ''}">${RANGE_LABELS[r]}</button>`)
      .join('');
    this.side.innerHTML = this.sidebar(page);

    // Charts sit two to a row when there's room for both at a readable size.
    const inner = Math.max(CHART_MIN, width - 26);
    const twoUp = page.charts.length > 1 && inner >= CHART_MIN * 2 + 10;
    const chartWidth = Math.floor((twoUp ? (inner - 10) / 2 : inner) - 24);
    // The overview's single graph is the centrepiece: make it taller.
    const height = page.id === 'overview' ? 240 : 190;
    this.drawn = [];
    const charts = page.charts.map((c) => this.chartCard(c, chartWidth, height)).join('');

    this.main.innerHTML = `
      <div class="sx-page-head"><h3>${page.icon} ${page.label}</h3><span class="muted">${page.hint}</span></div>
      ${page.tiles.length ? `<div class="sx-kpis">${page.tiles.map((id) => this.tile(id, page, state)).join('')}</div>` : ''}
      ${charts ? `<div class="sx-charts ${twoUp ? 'two' : ''}">${charts}</div>` : ''}
      ${this.extras(page, state)}`;
    this.hover();
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

  // --- Sidebar: one row per page -----------------------------------------------

  private sidebar(current: Page): string {
    return PAGES.map((p) => {
      const def = STATS[p.headline];
      const v = def ? this.lastKnown(def) : undefined;
      return `
        <button class="sx-nav ${p.id === current.id ? 'on' : ''}" data-page="${p.id}">
          <span class="sx-cat-icon">${p.icon}</span>
          <span class="sx-name">${p.label}</span>
          <span class="sx-val">${def && v !== undefined ? fmt(def.unit, v) : ''}${def ? this.trend(def) : ''}</span>
        </button>`;
    }).join('');
  }

  // A small ▲ / ▼ with the change over the visible range.
  private trend(s: StatDef): string {
    const was = this.firstKnown(s);
    const now = this.lastKnown(s);
    if (was === undefined || now === undefined || this.samples.length < 2) return '';
    const change = now - was;
    const scale = Math.max(Math.abs(was), Math.abs(now), 1e-9);
    if (Math.abs(change) / scale < 0.01) return '<em class="sx-trend flat">•</em>';
    const up = change > 0;
    const tone = s.upIsGood === undefined ? 'flat' : up === s.upIsGood ? 'good' : 'bad';
    const rel = Math.abs(was) > 1e-9 && s.unit !== 'pct' && s.unit !== 'temp' ? ` ${num(Math.min(999, Math.abs(change / was) * 100), 0)}%` : '';
    return `<em class="sx-trend ${tone}">${up ? '▲' : '▼'}${rel}</em>`;
  }

  // --- Number tiles -------------------------------------------------------------

  private tile(id: string, page: Page, state: GameState): string {
    const def = STATS[id]!;
    const values = this.samples.map(def.get).filter((v): v is number => v !== undefined);
    const v = this.lastKnown(def);
    const latest = this.samples.at(-1);
    let extra = '';
    if (id === 'racksRunning' && latest?.racks !== undefined) extra = `of ${latest.racks}`;
    if (id === 'headroom' && latest?.powerSupply !== undefined) extra = `of ${fmt('kw', latest.powerSupply)}`;
    if (id === 'cash') extra = clockText(state.tick);
    // On the overview, a tile opens its section; elsewhere it's just a number.
    const target = page.id === 'overview' ? HOME.get(id) : undefined;
    const tag = target ? 'button' : 'div';
    return `
      <${tag} class="sx-kpi ${target ? 'link' : ''}" ${target ? `data-page="${target}"` : ''} style="--c:${def.colour}">
        <span class="sx-kpi-label">${def.label}</span>
        <span class="sx-kpi-value">${v === undefined ? '–' : fmt(def.unit, v)} ${this.trend(def)}</span>
        <small>${extra || '&nbsp;'}</small>
        ${this.sparkline(values, def.colour)}
      </${tag}>`;
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

  // --- Charts ----------------------------------------------------------------------

  private chartCard(c: ChartDef, W: number, H: number): string {
    const series: Series[] = c.stats.map((id) => ({ id, def: STATS[id]!, values: this.samples.map(STATS[id]!.get) }));
    const legend = series
      .map((s) => {
        const v = this.lastKnown(s.def);
        return `<span class="sx-chip" style="--c:${s.def.colour}"><i></i>${s.def.label}<b>${v === undefined ? '–' : fmt(s.def.unit, v)}</b></span>`;
      })
      .join('');
    return `
      <div class="sx-card">
        <div class="sx-card-title">${c.title}</div>
        <div class="sx-legend">${legend}</div>
        <div class="sx-chart">${this.chart(series, W, H, c.lines ?? [])}<div class="sx-tip"></div></div>
      </div>`;
  }

  private chart(series: Series[], W: number, H: number, lines: NonNullable<ChartDef['lines']>): string {
    const n = this.samples.length;
    const index = this.drawn.length;
    const unit = series[0]!.def.unit;
    const known = series.flatMap((s) => s.values.filter((v): v is number => v !== undefined));
    const [min, max] = known.length ? extent(known, unit, lines.map((l) => l.value)) : [0, 1];
    this.drawn.push({ series, min, max, width: W, height: H });
    if (n < 2 || known.length < 2) {
      return `<div class="sx-empty" style="height:${H}px">Not enough data yet: a point is added every game hour.</div>`;
    }
    const x = (i: number): number => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number): number => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

    const grid = Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3)
      .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="sx-grid"/>
        <text x="${PAD.l - 8}" y="${y(v) + 3.5}" text-anchor="end">${axisFmt(unit, v)}</text>`)
      .join('');
    const zero = min < 0 && max > 0 ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}" class="sx-zero"/>` : '';
    const refs = lines
      .map((l) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(l.value)}" y2="${y(l.value)}" stroke="${l.colour}" stroke-dasharray="5 4" stroke-opacity="0.7"/>
        <text x="${W - PAD.r - 2}" y="${y(l.value) - 4}" text-anchor="end" style="fill:${l.colour}">${l.label} ${fmt(unit, l.value)}</text>`)
      .join('');
    // About one time label per 120px so they never run into each other.
    const marks = Math.max(2, Math.min(5, n, Math.floor(W / 120)));
    const times = Array.from({ length: marks }, (_, i) => Math.round((i * (n - 1)) / (marks - 1)))
      .map((i) => `<text x="${x(i)}" y="${H - 7}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${clockText(this.samples[i]!.tick).replace(' &middot; ', ' ')}</text>`)
      .join('');

    const base = y(Math.max(min, 0));
    const paths = series.map((s, k) => {
      // Split at missing values (samples from older saves).
      const runs: string[][] = [[]];
      s.values.forEach((v, i) => {
        if (v === undefined) runs.push([]);
        else runs.at(-1)!.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      });
      return runs.filter((r) => r.length > 1).map((pts) => {
        // Shade under the line when it's alone, so a single stat reads at a glance.
        const area = series.length === 1
          ? `<polygon points="${pts[0]!.split(',')[0]},${base} ${pts.join(' ')} ${pts.at(-1)!.split(',')[0]},${base}" fill="url(#sx-g${index}-${k})"/>` : '';
        return `${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${s.def.colour}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }).join('');
    }).join('');
    const gradients = series.map((s, k) => `
      <linearGradient id="sx-g${index}-${k}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${s.def.colour}" stop-opacity="0.3"/><stop offset="1" stop-color="${s.def.colour}" stop-opacity="0"/>
      </linearGradient>`).join('');

    return `<svg class="sx-svg" data-chart="${index}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${gradients}</defs>${grid}${zero}${refs}${times}${paths}
      <line class="sx-cursor" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/>
      ${series.map((s, k) => `<circle class="sx-dot" data-k="${k}" r="4" fill="${s.def.colour}" visibility="hidden"/>`).join('')}
    </svg>`;
  }

  // Hovering a chart shows a cursor line and each value at that hour.
  private hover(): void {
    this.main.querySelectorAll<SVGSVGElement>('.sx-svg').forEach((svg) => {
      const k = Number(svg.dataset.chart);
      const chart = this.drawn[k];
      const tip = svg.parentElement?.querySelector<HTMLElement>('.sx-tip');
      if (!chart || !tip) return;
      const cursor = svg.querySelector('.sx-cursor')!;
      const dots = svg.querySelectorAll<SVGCircleElement>('.sx-dot');
      const n = this.samples.length;
      const rect = svg.getBoundingClientRect();
      const e = this.pointer?.chart === k ? this.pointer : null;
      const inside = e && e.clientX >= rect.left + PAD.l && e.clientX <= rect.right - PAD.r;
      if (!e || !inside || n < 2) {
        cursor.setAttribute('visibility', 'hidden');
        dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
        tip.style.display = 'none';
        return;
      }
      const { width: W, height: H, min, max } = chart;
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))));
      const cx = PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
      cursor.setAttribute('x1', String(cx));
      cursor.setAttribute('x2', String(cx));
      cursor.setAttribute('visibility', 'visible');
      const rows: string[] = [];
      chart.series.forEach((s, j) => {
        const v = s.values[i];
        const dot = dots[j];
        if (v === undefined || !dot) {
          dot?.setAttribute('visibility', 'hidden');
          return;
        }
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)));
        dot.setAttribute('visibility', 'visible');
        rows.push(`<div><i style="background:${s.def.colour}"></i>${s.def.label}<b>${fmt(s.def.unit, v)}</b></div>`);
      });
      tip.innerHTML = `<div class="sx-tip-time">${clockText(this.samples[i]!.tick)}</div>${rows.join('')}`;
      tip.style.display = 'block';
      const left = (cx / W) * rect.width;
      tip.style.left = `${left > rect.width / 2 ? left - tip.offsetWidth - 12 : left + 12}px`;
    });
  }

  // --- Breakdowns, records and incidents ------------------------------------------

  private extras(page: Page, state: GameState): string {
    const out = (page.extras ?? []).map((x) => {
      if (x === 'incomeSplit') return this.breakdown('Where the money comes from', ['walkIn', 'contracts'], 'income');
      if (x === 'costSplit') {
        return this.breakdown('Where the money goes', ['electricity', 'wages', 'upkeep', 'rent', 'networkCost', 'overhead', 'tax'], 'costs');
      }
      if (x === 'records') return this.records(state);
      return this.incidents(state, page.id === 'overview' ? 4 : Infinity);
    });
    // Two breakdowns side by side on the overview.
    if (page.id === 'overview' && out.length >= 2) return `<div class="sx-split">${out[0]}${out[1]}</div>${out.slice(2).join('')}`;
    return out.join('');
  }

  // Average share of each part over the visible range, as a stacked bar and a
  // list. Rows open the page with that stat's graph.
  private breakdown(title: string, ids: string[], pageId: string): string {
    const parts = ids.map((id) => {
      const def = STATS[id]!;
      const vals = this.samples.map(def.get).filter((v): v is number => v !== undefined);
      return { id, def, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    });
    const total = parts.reduce((s, p) => s + p.avg, 0);
    if (total <= 0) return `<div class="sx-card"><div class="sx-card-title">${title}</div><div class="muted">No data yet.</div></div>`;
    const sorted = [...parts].sort((a, b) => b.avg - a.avg).filter((p) => p.avg > 0);
    const bar = sorted.map((p) => `<span style="width:${(p.avg / total) * 100}%;background:${p.def.colour}" title="${p.def.label}"></span>`).join('');
    const rows = sorted
      .map((p) => `
        <button class="sx-brk-row" data-page="${pageId}" style="--c:${p.def.colour}">
          <i></i><span>${p.def.label}</span><b>${fmt('perMin', p.avg)}</b><em>${num((p.avg / total) * 100, 0)}%</em>
        </button>`)
      .join('');
    return `
      <div class="sx-card">
        <div class="sx-card-title">${title}<span>${fmt('perMin', total)} average</span></div>
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
      ...(state.liveWorld ? ([['Tax paid', money(s.taxPaid)], ['Overhead paid', money(s.overheadPaid)]] as [string, string][]) : []),
    ];
    return `
      <div class="sx-card">
        <div class="sx-card-title">Records</div>
        <div class="sx-records">${tiles.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
  }

  private incidents(state: GameState, limit: number): string {
    const all = state.events.history.slice().reverse();
    const list = all
      .slice(0, limit)
      .map((e) => `<div class="sx-inc"><span class="ct-pill ${e.good ? 'good' : 'bad'}">${EVENT_NAMES[e.kind]}</span><span>${e.text}</span><span class="muted">${clockText(e.tick)}</span></div>`)
      .join('');
    const more = all.length > limit ? `<button class="sx-clear" data-page="incidents">See all ${all.length}</button>` : '';
    return `
      <div class="sx-card">
        <div class="sx-card-title">Recent incidents<span>last ${CONFIG.events.historyLength} kept</span></div>
        ${list || '<div class="muted">None yet.</div>'}${more}
      </div>`;
  }
}
