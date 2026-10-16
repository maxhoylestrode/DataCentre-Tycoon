import { BUILDING_KINDS, buildingDef, CONFIG, FLOOR_KINDS, isFloorKind } from '../config';
import { type Tool, TOOL_HOTKEYS, toolCost, toolName } from '../input/tools';
import { buildingStats } from '../sim/buildings';
import { isUnlocked, unlockFor } from '../sim/progression';
import type { GameState } from '../sim/state';

export interface ToolbarHandlers {
  onSelectTool(tool: Tool): void;
  onToggleHeat(): void;
  onToggleContracts(): void;
  onToggleStyle(): void;
}

interface Group {
  id: string;
  label: string;
  tools: Tool[];
}

const byCategory = (...cats: string[]): Tool[] => BUILDING_KINDS.filter((k) => cats.includes(buildingDef(k).category));

// The build menu, grouped so it fits on screen: one button per group, and
// clicking a group with several items opens a menu of them above the bar.
const GROUPS: Group[] = [
  { id: 'racks', label: 'Racks', tools: byCategory('rack') },
  { id: 'power', label: 'Power', tools: byCategory('power') },
  { id: 'cooling', label: 'Cooling', tools: [...byCategory('cooling', 'chiller'), ...FLOOR_KINDS] },
  { id: 'decor', label: 'Decor', tools: byCategory('decor') },
  { id: 'sell', label: 'Sell', tools: ['sell'] },
];

export function groupOf(tool: Tool): Group | undefined {
  return GROUPS.find((g) => g.tools.includes(tool));
}

// One-line summary of a stock (un-upgraded) building for the menu.
function summary(tool: Tool): string {
  if (tool === 'sell') return `${CONFIG.economy.sellRefund * 100}% refund`;
  const cost = `£${toolCost(tool).toLocaleString('en-GB')}`;
  if (isFloorKind(tool)) return `${cost} &middot; goes under racks, needs a chiller`;
  const def = buildingDef(tool);
  const s = buildingStats({
    id: 0, kind: tool, x: 0, y: 0, builtAtTick: 0, status: 'ok', repairDoneTick: null, upgrade: 0, parts: {},
  });
  switch (def.category) {
    case 'rack': return `${cost} &middot; £${s.income.toFixed(1)}/min &middot; ${s.powerDraw.toFixed(0)} kW`;
    case 'power': return `${cost} &middot; +${s.powerSupply} kW`;
    case 'cooling': return `${cost} &middot; ${s.coolingRadius * 2 + 1}×${s.coolingRadius * 2 + 1} &middot; ${s.powerDraw} kW`;
    case 'chiller': return `${cost} &middot; feeds ${def.chillerCapacity} vents`;
    case 'decor': return `${cost} &middot; +${s.prestige} prestige`;
  }
}

function lockText(state: GameState, tool: Tool): string | null {
  if (tool === 'sell' || isUnlocked(state, tool)) return null;
  return `Unlocks at level ${unlockFor(tool)?.level ?? '?'}`;
}

export class Toolbar {
  private readonly groupButtons = new Map<string, HTMLButtonElement>();
  private readonly toggles: { button: HTMLButtonElement; unlockId: string }[] = [];
  private readonly flyout: HTMLElement;
  private openGroup: string | null = null;
  // Last tool picked in each group, shown on the group's button.
  private readonly picked = new Map<string, Tool>(GROUPS.map((g) => [g.id, g.tools[0]!]));
  private lastFlyoutHtml = '';
  private lastButtonsKey = '';

  constructor(parent: HTMLElement, handlers: ToolbarHandlers) {
    const wrap = document.createElement('div');
    wrap.className = 'toolbar-wrap';
    this.flyout = document.createElement('div');
    this.flyout.className = 'flyout';
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    wrap.append(this.flyout, bar);
    parent.appendChild(wrap);

    const makeButton = (onClick: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      // pointerdown so re-rendered labels never swallow a click.
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        onClick();
      });
      bar.appendChild(button);
      return button;
    };

    for (const group of GROUPS) {
      const button = makeButton(() => {
        if (group.tools.length === 1) {
          this.openGroup = null;
          handlers.onSelectTool(group.tools[0]!);
        } else {
          this.openGroup = this.openGroup === group.id ? null : group.id;
        }
        this.lastFlyoutHtml = '';
      });
      this.groupButtons.set(group.id, button);
    }

    const toggle = (label: string, sub: string, unlockId: string, onClick: () => void, first = false): void => {
      const button = makeButton(onClick);
      button.innerHTML = `${label}<small>${sub}</small>`;
      if (first) button.classList.add('toggle');
      this.toggles.push({ button, unlockId });
    };
    toggle('Heat map (H)', 'overlay', 'heat_map', handlers.onToggleHeat, true);
    toggle('Contracts (K)', 'customers', 'contract_board', handlers.onToggleContracts);
    toggle('Style (L)', 'prestige', 'room_styles', handlers.onToggleStyle);

    this.flyout.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      const tool = button.dataset.tool as Tool;
      const group = groupOf(tool);
      if (group) this.picked.set(group.id, tool);
      handlers.onSelectTool(tool);
      this.openGroup = null;
      this.lastFlyoutHtml = '';
    });
  }

  // Remember a tool picked by hotkey too, so its group shows it.
  noteTool(tool: Tool): void {
    const group = groupOf(tool);
    if (group) this.picked.set(group.id, tool);
  }

  update(state: GameState, tool: Tool, open: { heat: boolean; contracts: boolean; style: boolean }): void {
    this.noteTool(tool);
    const key = [tool, ...GROUPS.map((g) => `${this.picked.get(g.id)}:${lockText(state, this.picked.get(g.id)!)}`)].join('|');
    if (key !== this.lastButtonsKey) {
      this.lastButtonsKey = key;
      for (const group of GROUPS) {
        const button = this.groupButtons.get(group.id)!;
        const shown = this.picked.get(group.id)!;
        const hotkey = TOOL_HOTKEYS[shown];
        const arrow = group.tools.length > 1 ? ' ▴' : '';
        const name = group.id === 'sell' ? 'Sell' : toolName(shown);
        button.innerHTML = `${name}${hotkey ? ` (${hotkey})` : ''}${arrow}<small>${lockText(state, shown) ?? group.label}</small>`;
        button.classList.toggle('active', group.tools.includes(tool));
      }
    }

    const states = [open.heat, open.contracts, open.style];
    this.toggles.forEach(({ button, unlockId }, i) => {
      const locked = !isUnlocked(state, unlockId);
      button.classList.toggle('locked', locked);
      button.classList.toggle('active', states[i]!);
    });

    this.renderFlyout(state, tool);
  }

  private renderFlyout(state: GameState, current: Tool): void {
    const group = GROUPS.find((g) => g.id === this.openGroup);
    if (!group) {
      if (this.flyout.classList.contains('open')) this.flyout.classList.remove('open');
      return;
    }
    const html = group.tools
      .map((tool) => {
        const lock = lockText(state, tool);
        const unaffordable = !lock && state.cash < toolCost(tool);
        return `<button data-tool="${tool}" class="${tool === current ? 'active' : ''} ${lock ? 'locked' : ''}" ${lock ? 'disabled' : ''}>
          ${toolName(tool)}<small class="${unaffordable ? 'bad' : ''}">${lock ?? summary(tool)}</small></button>`;
      })
      .join('');
    if (html !== this.lastFlyoutHtml) {
      this.lastFlyoutHtml = html;
      this.flyout.innerHTML = `<div class="flyout-title">${group.label}</div><div class="flyout-items">${html}</div>`;
    }
    this.flyout.classList.add('open');
  }
}
