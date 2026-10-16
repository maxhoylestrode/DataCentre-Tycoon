import { BUILDING_KINDS, buildingDef, CONFIG } from '../config';
import { type Tool, TOOL_HOTKEYS } from '../input/tools';
import { isUnlocked, unlockFor } from '../sim/progression';
import type { GameState } from '../sim/state';

export interface ToolbarHandlers {
  onSelectTool(tool: Tool): void;
  onToggleHeat(): void;
}

function detail(tool: Tool): string {
  if (tool === 'sell') return `${CONFIG.economy.sellRefund * 100}% refund`;
  const def = buildingDef(tool);
  const power = def.powerSupply > 0 ? `+${def.powerSupply} kW` : `${def.powerDraw} kW`;
  return `£${def.cost.toLocaleString('en-GB')} &middot; ${power}`;
}

interface ToolButton {
  button: HTMLButtonElement;
  sub: HTMLElement;
  // Unlock id gating this button, if any.
  unlockId: string | null;
  normalSub: string;
  locked: boolean | null;
}

// Build menu along the bottom of the screen. Locked items show greyed out
// with the level they unlock at.
export class Toolbar {
  private readonly tools = new Map<Tool, ToolButton>();
  private readonly heat: ToolButton;

  constructor(parent: HTMLElement, handlers: ToolbarHandlers) {
    const root = document.createElement('div');
    root.className = 'toolbar';
    parent.appendChild(root);

    const makeButton = (label: string, sub: string, unlockId: string | null, onClick: () => void): ToolButton => {
      const button = document.createElement('button');
      button.innerHTML = `${label}<small></small>`;
      button.addEventListener('click', () => {
        onClick();
        // Keep keyboard shortcuts (Space) from re-triggering the focused button.
        button.blur();
      });
      root.appendChild(button);
      return { button, sub: button.querySelector('small') as HTMLElement, unlockId, normalSub: sub, locked: null };
    };

    for (const tool of [...BUILDING_KINDS, 'sell'] as Tool[]) {
      const name = tool === 'sell' ? 'Sell' : buildingDef(tool).name;
      const key = TOOL_HOTKEYS[tool];
      const label = key ? `${name} (${key})` : name;
      const unlockId = tool === 'sell' ? null : tool;
      this.tools.set(tool, makeButton(label, detail(tool), unlockId, () => handlers.onSelectTool(tool)));
    }
    this.heat = makeButton('Heat map (H)', 'overlay', 'heat_map', handlers.onToggleHeat);
    this.heat.button.classList.add('toggle');
  }

  update(state: GameState, tool: Tool, heatVisible: boolean): void {
    for (const [t, entry] of this.tools) {
      this.refreshLock(state, entry);
      entry.button.classList.toggle('active', t === tool);
    }
    this.refreshLock(state, this.heat);
    this.heat.button.classList.toggle('active', heatVisible);
  }

  private refreshLock(state: GameState, entry: ToolButton): void {
    const locked = entry.unlockId !== null && !isUnlocked(state, entry.unlockId);
    if (locked === entry.locked) return;
    entry.locked = locked;
    entry.button.classList.toggle('locked', locked);
    const level = entry.unlockId ? unlockFor(entry.unlockId)?.level : undefined;
    entry.sub.innerHTML = locked ? `Unlocks at level ${level ?? '?'}` : entry.normalSub;
  }
}
