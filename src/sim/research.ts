// Research: permanent bonuses bought with cash and time. One project runs at
// a time; it's paid for upfront and finishes after its game days.

import { CONFIG } from '../config';
import { RESEARCH } from './content/research';
import type { ResearchEffectKind, ResearchProject } from './content/types';
import type { GameState } from './state';

export function researchProject(id: string): ResearchProject | undefined {
  return RESEARCH.find((r) => r.id === id);
}

// The summed bonus of every finished project of this kind. Fractions are
// capped below 1 so nothing becomes free.
export function researchBonus(state: GameState, kind: ResearchEffectKind): number {
  let total = 0;
  for (const id of state.research.done) {
    for (const e of researchProject(id)?.effects ?? []) if (e.kind === kind) total += e.value;
  }
  return kind === 'marketRacks' ? total : Math.min(0.9, total);
}

export type ResearchStatus = 'done' | 'running' | 'available' | 'locked_level' | 'locked_requires';

export function researchStatus(state: GameState, project: ResearchProject, level: number): ResearchStatus {
  if (state.research.done.includes(project.id)) return 'done';
  if (state.research.current?.id === project.id) return 'running';
  if (project.level > level) return 'locked_level';
  if (!project.requires.every((r) => state.research.done.includes(r))) return 'locked_requires';
  return 'available';
}

export function researchTicks(project: ResearchProject): number {
  return Math.max(1, Math.round((project.days * CONFIG.time.ticksPerDay) / CONFIG.research.speed));
}

// Runs every tick: advances the current project. Returns the project that
// finished this tick, if any.
export function stepResearch(state: GameState): ResearchProject | null {
  const current = state.research.current;
  if (!current) return null;
  current.remaining -= 1;
  if (current.remaining > 0) return null;
  state.research.current = null;
  if (!state.research.done.includes(current.id)) state.research.done.push(current.id);
  return researchProject(current.id) ?? null;
}
