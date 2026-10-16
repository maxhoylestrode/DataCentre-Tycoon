import { buildingDef, floorDef, isBuildingKind, isFloorKind } from '../config';
import { ACHIEVEMENTS } from '../sim/content/achievements';
import { GOALS } from '../sim/content/goals';
import { PARTS } from '../sim/content/parts';
import { ROOM_STYLES } from '../sim/content/styles';
import type { Unlock } from '../sim/content/types';
import { levelOf, tierFor, unlocksBetween } from '../sim/progression';
import type { ContractResult, GameState } from '../sim/state';
import { rewardText } from './goals';
import type { Toasts } from './toasts';

function unlockName(unlock: Unlock): string {
  if (unlock.type === 'building' && isBuildingKind(unlock.id)) return buildingDef(unlock.id).name;
  if (unlock.type === 'floor' && isFloorKind(unlock.id)) return floorDef(unlock.id).name;
  return unlock.name ?? unlock.id;
}

// Watches progress and pops up level-ups, goals and achievements. Detects
// changes by comparing with what it last saw, so the sim needs no events.
export class Announcer {
  private level = 1;
  private goals = 0;
  private achievements = 0;
  // History is capped, so track the last result seen rather than a count.
  private lastResult: ContractResult | undefined;

  constructor(private readonly toasts: Toasts, state: GameState) {
    this.reset(state);
  }

  // Call after loading or starting a game so old progress isn't announced.
  reset(state: GameState): void {
    this.level = levelOf(state);
    this.goals = state.progress.completedGoals.length;
    this.achievements = state.progress.achievements.length;
    this.lastResult = state.contracts.history.at(-1);
  }

  update(state: GameState): void {
    const { completedGoals, achievements } = state.progress;

    const history = state.contracts.history;
    if (history.at(-1) !== this.lastResult) {
      const seen = this.lastResult ? history.indexOf(this.lastResult) : -1;
      for (const r of history.slice(seen + 1)) this.announceContract(r);
      this.lastResult = history.at(-1);
    }

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
      // Parts and room styles carry their own levels.
      const parts = PARTS.filter((p) => p.level > this.level && p.level <= level && p.cost > 0);
      const styles = ROOM_STYLES.filter((s) => s.level > this.level && s.level <= level && s.cost > 0);
      if (unlocks.length) {
        lines.push(`<div>Unlocked: ${unlocks.map((u) => `<b>${unlockName(u)}</b>`).join(', ')}</div>`);
        for (const u of unlocks) if (u.description) lines.push(`<div class="muted">${u.description}</div>`);
      }
      if (parts.length) lines.push(`<div>New parts: ${parts.map((p) => `${p.brand} ${p.model}`).join(', ')}</div>`);
      if (styles.length) lines.push(`<div>New styles: ${styles.map((s) => s.name).join(', ')}</div>`);
      if (!unlocks.length && !parts.length && !styles.length) {
        lines.push('<div class="muted">No new unlocks this level. More coming soon.</div>');
      }
      this.toasts.show(lines.join(''), 'level');
    }
    this.level = level;
  }

  private announceContract(r: ContractResult): void {
    const uptime = `${(r.uptime * 100).toFixed(1)}% uptime`;
    const cash = `£${Math.abs(Math.round(r.cash)).toLocaleString('en-GB')}`;
    if (r.outcome === 'completed') {
      this.toasts.show(`<b>Contract kept:</b> ${r.name}<br>${uptime} &middot; +${cash} bonus, +${r.xp} XP`, 'goal');
    } else if (r.outcome === 'failed') {
      this.toasts.show(`<b>Promise broken:</b> ${r.name}<br>${uptime} &middot; -${cash} penalty`, 'failure');
    } else {
      this.toasts.show(`<b>Contract cancelled:</b> ${r.name}<br>-${cash} penalty`, 'failure');
    }
  }
}
