import { type Condition, evaluate } from '../sim/conditions';
import { ACHIEVEMENTS } from '../sim/content/achievements';
import type { Reward } from '../sim/content/types';
import { activeGoals } from '../sim/progression';
import type { GameState } from '../sim/state';

const MONEY_CONDITIONS: Condition['type'][] = ['totalEarned', 'cash', 'netIncome'];

function progressText(condition: Condition, current: number, target: number): string {
  if (MONEY_CONDITIONS.includes(condition.type)) {
    const decimals = condition.type === 'netIncome' ? 2 : 0;
    const fmt = (n: number): string =>
      `£${n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    return `${fmt(Math.max(0, current))} / ${fmt(target)}`;
  }
  return `${Math.floor(current)} / ${target}`;
}

export function rewardText(reward: Reward): string {
  const parts = [`+${reward.xp} XP`];
  if (reward.cash) parts.push(`+£${reward.cash.toLocaleString('en-GB')}`);
  return parts.join(', ');
}

// The active goal list, top right. Collapsible so it stays out of the way on small screens.
export class GoalsPanel {
  private readonly list: HTMLElement;
  private readonly header: HTMLButtonElement;
  private lastHtml = '';

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'goals';
    root.innerHTML = `<button class="goals-header"></button><div class="goals-list"></div>`;
    parent.appendChild(root);
    this.header = root.querySelector('.goals-header') as HTMLButtonElement;
    this.list = root.querySelector('.goals-list') as HTMLElement;
    if (window.innerWidth < 700) root.classList.add('collapsed');
    this.header.addEventListener('click', () => {
      root.classList.toggle('collapsed');
      this.header.blur();
    });
  }

  update(state: GameState): void {
    const goals = activeGoals(state);
    const rows = goals.map((goal) => {
      const { current, target } = evaluate(state, goal.condition);
      const pct = Math.min(100, Math.max(0, (current / target) * 100));
      return `
        <div class="goal">
          <div>${goal.description}</div>
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <div class="muted">${progressText(goal.condition, current, target)} &middot; ${rewardText(goal.reward)}</div>
        </div>`;
    });
    const html =
      (rows.length ? rows.join('') : '<div class="muted">All goals complete. More coming soon.</div>') +
      `<div class="muted achievements">Achievements: ${state.progress.achievements.length} / ${ACHIEVEMENTS.length}</div>`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.list.innerHTML = html;
    }
    const headerText = `Goals (${goals.length})`;
    if (this.header.textContent !== headerText) this.header.textContent = headerText;
  }
}
