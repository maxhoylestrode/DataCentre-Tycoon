import { CONFIG } from '../config';
import { EVENT_NAMES } from '../sim/events';
import { clockText } from './format';
import type { GameState, HistorySample } from '../sim/state';
import { ICONS } from './icons';

type Range = 'day' | 'week' | 'all';
const RANGE_SAMPLES: Record<Range, number> = { day: 24, week: 24 * 7, all: Infinity };
const RANGE_LABELS: Record<Range, string> = { day: '24 hours', week: '7 days', all: 'All' };

interface Series {
  label: string;
  colour: string;
  values: number[];
  fill?: boolean;
}

const money = (n: number): string => {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `£${(abs / 1e6).toFixed(1)}m` : abs >= 1e4 ? `£${(abs / 1e3).toFixed(0)}k` : `£${abs.toFixed(abs < 10 ? 1 : 0)}`;
  return n < 0 ? `-${s}` : s;
};

// A small line chart as inline SVG. Zero line drawn when the range crosses it.
function chart(title: string, series: Series[], format: (n: number) => string): string {
  const W = 320;
  const H = 110;
  const pad = { l: 44, r: 6, t: 8, b: 14 };
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return `<div class="st-chart"><div class="st-title">${title}</div><div class="muted st-empty">Not enough data yet: one point per game hour.</div></div>`;
  let min = Math.min(0, ...all);
  let max = Math.max(...all);
  if (max - min < 1e-6) max = min + 1;
  const span = max - min;
  min -= span * 0.05;
  max += span * 0.05;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number): number => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number): number => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = s.fill
      ? `<polygon points="${x(0)},${y(Math.max(min, 0))} ${pts} ${x(s.values.length - 1)},${y(Math.max(min, 0))}" fill="${s.colour}" fill-opacity="0.15"/>`
      : '';
    return `${area}<polyline points="${pts}" fill="none" stroke="${s.colour}" stroke-width="1.8" stroke-linejoin="round"/>`;
  });
  const zero = min < 0 && max > 0 ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="#ffffff" stroke-opacity="0.25" stroke-dasharray="3 3"/>` : '';
  const grid = [max, (max + min) / 2, min]
    .map((v) => `<text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${format(v)}</text><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ffffff" stroke-opacity="0.06"/>`)
    .join('');
  const legend = series
    .map((s) => `<span><i style="background:${s.colour}"></i>${s.label} <b>${format(s.values[s.values.length - 1] ?? 0)}</b></span>`)
    .join('');
  return `<div class="st-chart">
      <div class="st-title">${title}<div class="st-legend">${legend}</div></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="st-svg">${grid}${zero}${paths.join('')}</svg>
    </div>`;
}

// Graphs of the business over time, and recent incidents.
export class StatsPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private range: Range = 'week';
  private lastKey = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel stats-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.stats}<h2>Stats</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.range) this.range = button.dataset.range as Range;
      this.lastKey = '';
    });
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
    const key = `${state.history.samples.length}:${state.history.samples.at(-1)?.tick}:${this.range}:${state.events.history.length}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const samples: HistorySample[] = state.history.samples.slice(-RANGE_SAMPLES[this.range]);
    const pick = (f: (s: HistorySample) => number): number[] => samples.map(f);
    const perMin = (n: number): string => `${money(n)}`;
    const tabs = (Object.keys(RANGE_LABELS) as Range[])
      .map((r) => `<button data-range="${r}" class="${r === this.range ? 'active' : ''}">${RANGE_LABELS[r]}</button>`)
      .join('');
    const s = state.progress.stats;
    const totals = `
      <div class="st-totals">
        <div><span class="muted">Earned in total</span><b>${money(s.totalEarned)}</b></div>
        <div><span class="muted">Best day</span><b>${money(s.bestDayProfit)}</b></div>
        <div><span class="muted">Contracts done</span><b>${s.contractsCompleted}</b></div>
        <div><span class="muted">Rack failures</span><b>${s.failures}</b></div>
      </div>`;
    const charts = [
      chart('Money per minute', [
        { label: 'In', colour: '#4cc38a', values: pick((x) => x.income) },
        { label: 'Out', colour: '#ff7a7f', values: pick((x) => x.costs) },
      ], perMin),
      chart('Profit per minute', [{ label: 'Net', colour: '#4aa8ff', values: pick((x) => x.income - x.costs), fill: true }], perMin),
      chart('Cash', [{ label: 'Bank', colour: '#ffd23a', values: pick((x) => x.cash), fill: true }], money),
      chart('Power', [
        { label: 'Supply', colour: '#ffd23a', values: pick((x) => x.powerSupply) },
        { label: 'Draw', colour: '#ff8a2a', values: pick((x) => x.powerDraw) },
      ], (n) => `${n.toFixed(0)} kW`),
      chart('Uptime', [{ label: 'Uptime', colour: '#7fe0a8', values: pick((x) => x.uptime * 100), fill: true }], (n) => `${n.toFixed(0)}%`),
      chart('Racks', [{ label: 'Racks', colour: '#c3b8ff', values: pick((x) => x.racks) }], (n) => n.toFixed(0)),
    ];
    const events = state.events.history
      .slice()
      .reverse()
      .map((e) => `<div class="ct-hist"><span class="ct-pill ${e.good ? 'good' : 'bad'}">${EVENT_NAMES[e.kind]}</span><span>${e.text}</span><span class="muted">${clockText(e.tick)}</span></div>`)
      .join('');
    this.body.innerHTML = `
      <div class="st-tabs">${tabs}<span class="muted">one point per game hour · last ${CONFIG.history.maxSamples / 24} days kept</span></div>
      ${totals}
      <div class="st-grid">${charts.join('')}</div>
      <h3>Recent incidents</h3>
      ${events || '<p class="muted">None yet.</p>'}`;
  }
}
