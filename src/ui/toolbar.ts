import { BUILDING_KINDS, buildingDef, CONFIG, FLOOR_KINDS, isFloorKind, WALL_KINDS } from '../config';
import { isWallTool, isZoneTool, type Tool, TOOL_HOTKEYS, toolCost, toolName, ZONE_TOOLS } from '../input/tools';
import { buildingStats } from '../sim/buildings';
import { formatMbps } from '../sim/network';
import { isUnlocked, unlockFor } from '../sim/progression';
import type { GameState } from '../sim/state';
import { kw } from './format';
import { type GroupIcon, ICONS, itemIcon } from './icons';

export interface ToolbarHandlers {
  onSelectTool(tool: Tool): void;
  onToggleHeat(): void;
  onToggleContracts(): void;
  onToggleStyle(): void;
  onToggleWallHeight(): void;
  onToggleStaff(): void;
  onToggleGuide(): void;
  onToggleResearch(): void;
  onToggleStats(): void;
  onToggleRackList(): void;
  onToggleAgeBars(): void;
  onUndo(): void;
}

interface Group {
  id: GroupIcon;
  label: string;
  tools: Tool[];
  hotkey?: string;
}

const byCategory = (...cats: string[]): Tool[] => BUILDING_KINDS.filter((k) => cats.includes(buildingDef(k).category));

// The hotbar, in the style of Cities: Skylines 2: icon buttons per group,
// and a panel of item cards above the bar for groups with several items.
const GROUPS: Group[] = [
  { id: 'racks', label: 'Racks', tools: byCategory('rack'), hotkey: TOOL_HOTKEYS.rack_basic },
  { id: 'power', label: 'Power', tools: byCategory('power'), hotkey: TOOL_HOTKEYS.power_basic },
  { id: 'cooling', label: 'Cooling', tools: [...byCategory('cooling', 'chiller'), ...FLOOR_KINDS], hotkey: TOOL_HOTKEYS.cooling_fan },
  { id: 'safety', label: 'Safety', tools: byCategory('safety'), hotkey: TOOL_HOTKEYS.ups_battery },
  { id: 'decor', label: 'Decor', tools: byCategory('decor') },
  { id: 'zones', label: 'Zones', tools: [...ZONE_TOOLS, ...byCategory('furniture')], hotkey: TOOL_HOTKEYS.zone_server },
  { id: 'walls', label: 'Walls', tools: [...WALL_KINDS], hotkey: TOOL_HOTKEYS.wall_basic },
  { id: 'move', label: 'Move', tools: ['move'], hotkey: TOOL_HOTKEYS.move },
  { id: 'sell', label: 'Sell', tools: ['sell'], hotkey: TOOL_HOTKEYS.sell },
];

interface Toggle {
  id: GroupIcon;
  label: string;
  hotkey?: string;
  unlockId: string;
  onClick: () => void;
}

export function groupOf(tool: Tool): Group | undefined {
  return GROUPS.find((g) => g.tools.includes(tool));
}

const money = (n: number): string => `£${n.toLocaleString('en-GB')}`;

// The headline number for a stock (un-upgraded) building on its card.
function stat(tool: Tool): string {
  if (tool === 'sell') return `${CONFIG.economy.sellRefund * 100}% refund`;
  if (tool === 'move') return 'Free · keeps upgrades';
  if (isFloorKind(tool)) return 'Under racks · needs chiller';
  if (isZoneTool(tool)) return ZONE_HINTS[tool] ?? '';
  if (isWallTool(tool)) {
    if (tool === 'door_outside') return 'Outside walls · clients & staff enter';
    return tool === 'wall_door' ? 'Per tile · people walk through' : 'Per tile · drag to draw · blocks heat';
  }
  const def = buildingDef(tool);
  const s = buildingStats({
    id: 0, kind: tool, x: 0, y: 0, builtAtTick: 0, status: 'ok', repairDoneTick: null, upgrade: 0, parts: {},
    rot: 0, refreshedAtTick: 0, lastServicedTick: 0, buildRemaining: 0,
  });
  switch (def.category) {
    case 'rack': return `£${s.income.toFixed(1)}/min · ${kw(s.powerDraw)}`;
    case 'power':
      if (def.renewable) return `+${kw(s.powerSupply)} · free electricity`;
      return `+${kw(s.powerSupply)} · 2×2 = +${CONFIG.multiblock.bonus * 100}%${def.gridFed ? '' : ' · on-site'}`;
    case 'safety':
      if (def.backupKw) return `${kw(def.backupKw)} backup in power cuts · upgradable`;
      if (def.suppressionRadius) return `Stops fires · ${def.suppressionRadius * 2 + 1}×${def.suppressionRadius * 2 + 1} area`;
      return `Filters ${formatMbps(def.ddosFilterMbps ?? 0)} of attacks · upgradable`;
    case 'cooling': return s.coolingRadius > 20 ? `Whole room · ${kw(s.powerDraw)}` : `${s.coolingRadius * 2 + 1}×${s.coolingRadius * 2 + 1} area · ${kw(s.powerDraw)}`;
    case 'chiller': return `Feeds ${def.chillerCapacity} vents · ${def.chillerRange} tiles`;
    case 'decor': return `+${s.prestige} prestige`;
    case 'furniture': return FURNITURE_HINTS[tool] ?? '';
  }
}

// One line under each menu's title.
const GROUP_HINTS: Partial<Record<GroupIcon, string>> = {
  racks: 'Servers that earn money · drag to place rows with aisles',
  power: 'Keep supply above draw · 4 of a kind in a 2×2 square = +25%',
  cooling: 'Keep racks under 45°C · press H for the heat map',
  safety: 'Protection against power cuts, fires and cyber attacks · place anywhere, upgrade by clicking',
  decor: 'Prestige: better contract pay and more offers',
  zones: 'Drag to paint rooms, then add their furniture',
  walls: 'Drag along grid lines · walls block heat',
};

const ZONE_HINTS: Record<string, string> = {
  zone_server: 'Racks here earn +5%',
  zone_staff: 'Needs coffee + break tables',
  zone_storage: 'Needs shelving · faster builds',
  zone_clear: 'Erase zones',
};

const FURNITURE_HINTS: Record<string, string> = {
  break_table: 'Staff room · houses 4 staff',
  coffee_machine: 'Staff room · required',
  lockers: 'Staff room · +1 prestige',
  shelving: 'Storage room · faster builds',
};

// The unlock id gating a tool: zone tools share the "zones" mechanic.
const unlockIdOf = (tool: Tool): string | null =>
  tool === 'sell' || tool === 'move' ? null : isZoneTool(tool) ? 'zones' : tool;

export function toolUnlocked(state: GameState, tool: Tool): boolean {
  const id = unlockIdOf(tool);
  return id === null || isUnlocked(state, id);
}

const unlockLevel = (tool: Tool): number | null => {
  const id = unlockIdOf(tool);
  return id === null ? null : (unlockFor(id)?.level ?? null);
};

export class Toolbar {
  private readonly groupButtons = new Map<string, HTMLButtonElement>();
  private readonly toggleButtons: { button: HTMLButtonElement; toggle: Toggle }[] = [];
  private readonly panel: HTMLElement;
  private openGroup: string | null = null;
  private lastPanelHtml = '';

  constructor(parent: HTMLElement, handlers: ToolbarHandlers) {
    const wrap = document.createElement('div');
    wrap.className = 'hotbar-wrap';
    this.panel = document.createElement('div');
    this.panel.className = 'hb-panel';
    const bar = document.createElement('div');
    bar.className = 'hotbar';
    wrap.append(this.panel, bar);
    parent.appendChild(wrap);

    // pointerdown so a re-render between press and release never loses a click.
    const button = (
      icon: GroupIcon,
      label: string,
      hotkey: string | undefined,
      onClick: () => void,
      into: HTMLElement = bar,
      small = false,
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = small ? 'hb-btn hb-small' : 'hb-btn';
      b.title = hotkey ? `${label} (${hotkey})` : label;
      b.innerHTML = `${ICONS[icon]}<span class="hb-label">${label}</span>${hotkey ? `<span class="hb-key">${hotkey}</span>` : ''}`;
      b.addEventListener('pointerdown', (e) => {
        if (e.button === 0) onClick();
      });
      into.appendChild(b);
      return b;
    };

    for (const group of GROUPS) {
      const b = button(group.id, group.label, group.hotkey, () => {
        if (group.tools.length === 1) {
          this.openGroup = null;
          handlers.onSelectTool(group.tools[0]!);
        } else {
          this.openGroup = this.openGroup === group.id ? null : group.id;
        }
        this.lastPanelHtml = '';
      });
      this.groupButtons.set(group.id, b);
    }

    const divider = document.createElement('div');
    divider.className = 'hb-divider';
    bar.appendChild(divider);

    const toggles: Toggle[] = [
      { id: 'heat', label: 'Heat', hotkey: 'H', unlockId: 'heat_map', onClick: handlers.onToggleHeat },
      { id: 'contracts', label: 'Contracts', hotkey: 'K', unlockId: 'contract_board', onClick: handlers.onToggleContracts },
      { id: 'staff', label: 'Staff', hotkey: 'T', unlockId: 'rack_basic', onClick: handlers.onToggleStaff },
      { id: 'research', label: 'Research', hotkey: 'Y', unlockId: 'research', onClick: handlers.onToggleResearch },
      { id: 'stats', label: 'Stats', hotkey: 'N', unlockId: 'rack_basic', onClick: handlers.onToggleStats },
      { id: 'racklist', label: 'All racks', hotkey: 'J', unlockId: 'rack_basic', onClick: handlers.onToggleRackList },
      { id: 'agebars', label: 'Rack condition bars', unlockId: 'rack_basic', onClick: handlers.onToggleAgeBars },
      { id: 'style', label: 'Style', hotkey: 'L', unlockId: 'room_styles', onClick: handlers.onToggleStyle },
      { id: 'wallHeight', label: 'Tall walls', hotkey: 'V', unlockId: 'wall_basic', onClick: handlers.onToggleWallHeight },
      { id: 'guide', label: 'Guide', hotkey: 'G', unlockId: 'rack_basic', onClick: handlers.onToggleGuide },
      { id: 'undo', label: 'Undo', hotkey: '⌃Z', unlockId: 'rack_basic', onClick: handlers.onUndo },
    ];
    // Panels and views: a compact grid of small icon buttons (names on hover).
    const tools = document.createElement('div');
    tools.className = 'hb-tools';
    bar.appendChild(tools);
    for (const toggle of toggles) {
      this.toggleButtons.push({ button: button(toggle.id, toggle.label, toggle.hotkey, toggle.onClick, tools, true), toggle });
    }

    this.panel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tool],[data-act]');
      if (!target) return;
      if (target.dataset.act === 'close') {
        this.openGroup = null;
        return;
      }
      if (target.dataset.act === 'left' || target.dataset.act === 'right') {
        const cards = this.panel.querySelector<HTMLElement>('.hb-cards');
        if (cards) cards.scrollBy({ left: (target.dataset.act === 'left' ? -1 : 1) * cards.clientWidth * 0.8 });
        return;
      }
      if (target.classList.contains('locked')) return;
      handlers.onSelectTool(target.dataset.tool as Tool);
    });

    // The cards scroll sideways: let a normal mouse wheel do that.
    this.panel.addEventListener(
      'wheel',
      (e) => {
        const cards = this.panel.querySelector<HTMLElement>('.hb-cards');
        if (!cards || cards.scrollWidth <= cards.clientWidth) return;
        e.preventDefault();
        cards.scrollBy({ left: Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX });
      },
      { passive: false },
    );
    // Scroll events don't bubble; capture them to update the edge fades.
    this.panel.addEventListener('scroll', () => this.updateScrollHints(), true);
  }

  // Shows the fades and arrows on whichever side has more cards.
  private updateScrollHints(): void {
    const cards = this.panel.querySelector<HTMLElement>('.hb-cards');
    const scroller = this.panel.querySelector<HTMLElement>('.hb-scroller');
    if (!cards || !scroller) return;
    scroller.classList.toggle('more-left', cards.scrollLeft > 4);
    scroller.classList.toggle('more-right', cards.scrollLeft + cards.clientWidth < cards.scrollWidth - 4);
  }

  close(): void {
    this.openGroup = null;
  }

  update(
    state: GameState,
    tool: Tool,
    // Which toggle buttons show as on, by toggle id (e.g. heat, contracts);
    // undo shows as available or not.
    open: Partial<Record<GroupIcon, boolean>>,
  ): void {
    for (const group of GROUPS) {
      const b = this.groupButtons.get(group.id)!;
      b.classList.toggle('active', group.tools.includes(tool));
      b.classList.toggle('open', this.openGroup === group.id);
      // Grey a group out only if nothing in it is unlocked yet.
      b.classList.toggle('locked', !group.tools.some((t) => toolUnlocked(state, t)));
    }
    this.toggleButtons.forEach(({ button, toggle }) => {
      // Undo greys out when there's nothing to undo.
      const locked = !isUnlocked(state, toggle.unlockId) || (toggle.id === 'undo' && !open.undo);
      button.classList.toggle('locked', locked);
      button.classList.toggle('active', toggle.id !== 'undo' && open[toggle.id] === true);
      button.title =
        toggle.id === 'undo'
          ? open.undo ? 'Undo the last change (Ctrl+Z)' : 'Nothing to undo'
          : locked
            ? `${toggle.label}: unlocks at level ${unlockFor(toggle.unlockId)?.level ?? '?'}`
            : `${toggle.label} (${toggle.hotkey})`;
    });
    this.renderPanel(state, tool);
  }

  private renderPanel(state: GameState, current: Tool): void {
    const group = GROUPS.find((g) => g.id === this.openGroup);
    if (!group) {
      this.panel.classList.remove('open');
      return;
    }
    const cards = group.tools.map((t) => {
      const locked = !toolUnlocked(state, t);
      const cost = toolCost(t);
      const short = !locked && state.cash < cost;
      return `
        <div class="hb-card ${t === current ? 'active' : ''} ${locked ? 'locked' : ''}" data-tool="${t}">
          <div class="hb-thumb">${itemIcon(t)}${locked ? `<div class="hb-lock">${ICONS.lock}<span>Lv ${unlockLevel(t)}</span></div>` : ''}</div>
          <div class="hb-name">${toolName(t)}</div>
          <div class="hb-cost ${short ? 'bad' : ''}">${cost ? money(cost) : '&nbsp;'}</div>
          <div class="hb-stat">${stat(t)}</div>
        </div>`;
    });
    const unlocked = group.tools.filter((t) => toolUnlocked(state, t)).length;
    const html = `
      <div class="hb-head">
        <div class="hb-head-icon">${ICONS[group.id]}</div>
        <div><div class="hb-title">${group.label}</div><div class="hb-sub">${GROUP_HINTS[group.id] ?? ''}</div></div>
        <span class="hb-count">${unlocked} / ${group.tools.length} unlocked</span>
        <button data-act="close" aria-label="Close">✕</button>
      </div>
      <div class="hb-scroller">
        <button class="hb-arrow left" data-act="left" aria-label="Scroll left">‹</button>
        <div class="hb-cards">${cards.join('')}</div>
        <button class="hb-arrow right" data-act="right" aria-label="Scroll right">›</button>
      </div>`;
    this.panel.dataset.group = group.id;
    if (html !== this.lastPanelHtml) {
      // Re-rendering (e.g. cash changed) must not jump the scroll back to the start,
      // but switching groups should.
      const sameGroup = this.lastPanelHtml !== '';
      const scroll = this.panel.querySelector<HTMLElement>('.hb-cards')?.scrollLeft ?? 0;
      this.lastPanelHtml = html;
      this.panel.innerHTML = html;
      const cards = this.panel.querySelector<HTMLElement>('.hb-cards')!;
      cards.style.scrollBehavior = 'auto';
      cards.scrollLeft = sameGroup ? scroll : 0;
      cards.style.scrollBehavior = '';
    }
    this.panel.classList.add('open');
    this.updateScrollHints();
  }
}
