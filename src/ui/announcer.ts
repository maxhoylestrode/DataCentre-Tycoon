import { buildingDef, isBuildingKind } from '../config';
import { ACHIEVEMENTS } from '../sim/content/achievements';
import { GOALS } from '../sim/content/goals';
import type { Unlock } from '../sim/content/types';
import { levelOf, tierFor, unlocksBetween } from '../sim/progression';
import type { GameState } from '../sim/state';
import { rewardText } from './goals';
import type { Toasts } from './toasts';

function unlockName(unlock: Unlock): string {
  if (unlock.type === 'building' && isBuildingKind(unlock.id)) return buildingDef(unlock.id).name;
  return unlock.name ?? unlock.id;
}

// Watches progress and pops up level-ups, goals and achievements. Detects
// changes by comparing with what it last saw, so the sim needs no events.
export class Announcer {
  private level = 1;
  private goals = 0;
  private achievements = 0;

  constructor(private readonly toasts: Toasts, state: GameState) {
    this.reset(state);
  }

  // Call after loading or starting a game so old progress isn't announced.
  reset(state: GameState): void {
    this.level = levelOf(state);
    this.goals = state.progress.completedGoals.length;
    this.achievements = state.progress.achievements.length;
  }

  update(state: GameState): void {
    const { completedGoals, achievements } = state.progress;

    for (const id of completedGoals.slice(this.goals)) {
      const goal = GOALS.find((g) => g.id === id);
      if (goal) this.toasts.show(`<b>Goal complete:</b> ${goal.description}<br>${rewardText(goal.reward)}`, 'goal');
    }
    this.goals = completedGoals.length;

    for (const id of achievements.slice(this.achievements)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) this.toasts.show(`<b>Achievement: ${a.name}</b><br>${a.description} &middot; ${rewardText(a.reward)}`, 'achievement');
    }
    this.achievements = achievements.length;

    const level = levelOf(state);
    if (level > this.level) {
      const unlocks = unlocksBetween(this.level, level);
      const oldTier = tierFor(this.level);
      const tier = tierFor(level);
      const lines = [`<div class="big">Level ${level}!</div>`];
      if (tier.id !== oldTier.id) lines.push(`<div>New tier: <b>${tier.name}</b> &middot; ${tier.description}</div>`);
      if (unlocks.length) {
        lines.push(`<div>Unlocked: ${unlocks.map((u) => `<b>${unlockName(u)}</b>`).join(', ')}</div>`);
        for (const u of unlocks) if (u.description) lines.push(`<div class="muted">${u.description}</div>`);
      } else {
        lines.push('<div class="muted">No new unlocks this level. More coming soon.</div>');
      }
      this.toasts.show(lines.join(''), 'level');
    }
    this.level = level;
  }
}
