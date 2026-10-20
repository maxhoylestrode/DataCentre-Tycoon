import { evaluate, FRACTION_CONDITIONS } from '../sim/conditions';
import { ACHIEVEMENTS } from '../sim/content/achievements';
import type { Achievement } from '../sim/content/types';
import { unclaimedAchievements } from '../sim/progression';
import type { GameState } from '../sim/state';
import { rewardText } from './goals';
import { ICONS } from './icons';

export interface AchievementHandlers {
  // The trophy button was pressed (the caller opens or closes the panel).
  onToggle(): void;
  // One achievement, or all unclaimed ones (no id).
  onClaim(id?: string): void;
}

const MONEY = ['totalEarned', 'cash', 'netIncome'];

function progressText(a: Achievement, current: number, target: number): string {
  const type = a.condition.type;
  if (FRACTION_CONDITIONS.includes(type)) return `${Math.round(current * 100)}% / ${Math.round(target * 100)}%`;
  if (MONEY.includes(type)) return `£${Math.max(0, Math.floor(current)).toLocaleString('en-GB')} / £${target.toLocaleString('en-GB')}`;
  return `${Math.floor(current).toLocaleString('en-GB')} / ${target.toLocaleString('en-GB')}`;
}

// A trophy button (top right) with a count of rewards waiting, and the
// panel it opens: claim earned achievements, see what's left.
export class AchievementsPanel {
  private readonly button: HTMLButtonElement;
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastHtml = '';
  private lastBadge = '';

  constructor(parent: HTMLElement, handlers: AchievementHandlers) {
    this.button = document.createElement('button');
    this.button.className = 'ach-toggle';
    this.button.title = 'Achievements';
    this.button.addEventListener('pointerdown', (e) => {
      if (e.button === 0) handlers.onToggle();
    });
    parent.appendChild(this.button);

    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel achievements-panel';
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.achievements}<h2>Achievements</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="contracts-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.contracts-body') as HTMLElement;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.act === 'claim') handlers.onClaim(button.dataset.id);
      else if (button.dataset.act === 'claim-all') handlers.onClaim();
      this.lastHtml = '';
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
    this.lastHtml = '';
  }

  update(state: GameState): void {
    const waiting = unclaimedAchievements(state);
    const earned = state.progress.achievements.length;
    const badge = `${ICONS.achievements}${waiting.length ? `<span class="ach-badge">${waiting.length}</span>` : ''}`;
    if (badge !== this.lastBadge) {
      this.lastBadge = badge;
      this.button.innerHTML = badge;
      this.button.classList.toggle('ready', waiting.length > 0);
      this.button.title = waiting.length ? `Achievements: ${waiting.length} reward${waiting.length > 1 ? 's' : ''} to claim` : 'Achievements';
    }
    if (!this.open) return;

    const card = (a: Achievement, kind: 'claim' | 'done' | 'locked'): string => {
      if (kind === 'locked') {
        const { current, target } = evaluate(state, a.condition);
        const share = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
        return `<div class="ach-card locked"><div class="ach-icon">${ICONS.lock}</div><div class="ach-text"><b>${a.name}</b><span class="muted">${a.description}</span>
          <div class="ct-bar"><div class="ct-fill" style="width:${Math.round(share * 100)}%"></div></div><span class="ach-progress">${progressText(a, current, target)} · ${rewardText(a.reward)}</span></div></div>`;
      }
      const action = kind === 'claim'
        ? `<button data-act="claim" data-id="${a.id}" class="primary">Claim ${rewardText(a.reward)}</button>`
        : '<span class="ct-pill good">Claimed</span>';
      return `<div class="ach-card ${kind}"><div class="ach-icon">${ICONS.achievements}</div><div class="ach-text"><b>${a.name}</b><span class="muted">${a.description}</span></div>${action}</div>`;
    };

    const claimable = ACHIEVEMENTS.filter((a) => waiting.includes(a.id));
    const claimed = ACHIEVEMENTS.filter((a) => state.progress.claimedAchievements.includes(a.id));
    const locked = ACHIEVEMENTS.filter((a) => !state.progress.achievements.includes(a.id));
    const html = `
      <div class="ach-summary"><b>${earned} / ${ACHIEVEMENTS.length}</b> earned
        ${claimable.length > 1 ? '<button data-act="claim-all" class="primary">Claim all</button>' : ''}</div>
      ${claimable.length ? `<h3>Ready to claim</h3>${claimable.map((a) => card(a, 'claim')).join('')}` : ''}
      <h3>Still to do</h3>${locked.map((a) => card(a, 'locked')).join('') || '<p class="muted">Every achievement earned. Impressive.</p>'}
      ${claimed.length ? `<h3>Earned</h3>${claimed.map((a) => card(a, 'done')).join('')}` : ''}`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      const scroll = this.body.scrollTop;
      this.body.innerHTML = html;
      this.body.scrollTop = scroll;
    }
  }
}
