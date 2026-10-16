// What the selected tool would do on a tile, and doing it. Pure logic over
// sim state and commands, so hover feedback and clicks always agree.

import {
  type BuildingKind,
  buildingDef,
  CONFIG,
  type FloorKind,
  floorDef,
  isFloorKind,
  isWallKind,
  type WallKind,
} from '../config';
import { investedValue } from '../sim/buildings';
import { placeBuilding, placeFloor, removeFloor, repairRack, sellBuilding } from '../sim/commands';
import { canAfford, repairCost } from '../sim/economy';
import { isOwnedTile, lotAt, nextLotPrice, purchasableLots } from '../sim/lots';
import { isUnlocked, unlockFor } from '../sim/progression';
import { categoryOf, floorAt, type GameState, getBuildingAt } from '../sim/state';

export type Tool = BuildingKind | FloorKind | WallKind | 'sell';
// inspect: clicking opens the building panel (stats, upgrades, sell).
// draw: wall tools, which drag along grid lines instead of clicking tiles.
export type ToolAction = 'place' | 'sell' | 'repair' | 'inspect' | 'blocked' | 'draw';

// Buildings added later without a hotkey are still selectable from the toolbar.
export const TOOL_HOTKEYS: Partial<Record<Tool, string>> = {
  rack_basic: 'R',
  power_basic: 'P',
  cooling_fan: 'C',
  wall_basic: 'B',
  sell: 'X',
};

export function isWallTool(tool: Tool): tool is WallKind {
  return tool !== 'sell' && isWallKind(tool);
}

export interface ToolPreview {
  action: ToolAction;
  text: string;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

export function toolName(tool: Tool): string {
  if (tool === 'sell') return 'Sell';
  if (isWallTool(tool)) return CONFIG.walls[tool].name;
  return isFloorKind(tool) ? floorDef(tool).name : buildingDef(tool).name;
}

export function toolCost(tool: Tool): number {
  if (tool === 'sell') return 0;
  if (isWallTool(tool)) return CONFIG.walls[tool].cost;
  return isFloorKind(tool) ? floorDef(tool).cost : buildingDef(tool).cost;
}

export function previewTool(state: GameState, tool: Tool, x: number, y: number): ToolPreview | null {
  if (state.bankrupt) return null;
  if (!isOwnedTile(state, x, y)) {
    const lot = lotAt(state, x, y);
    if (lot && purchasableLots(state).some((l) => l.id === lot.id)) {
      return { action: 'blocked', text: `Room for sale: ${money(nextLotPrice(state))}. Click to buy` };
    }
    return { action: 'blocked', text: 'Locked room: buy a room next to it first' };
  }
  const building = getBuildingAt(state, x, y);
  const floor = floorAt(state, x, y);

  if (tool === 'sell') {
    if (building) {
      const def = buildingDef(building.kind);
      return { action: 'sell', text: `Sell ${def.name}: +${money(investedValue(building) * CONFIG.economy.sellRefund)}` };
    }
    if (floor) {
      const def = floorDef(floor.kind);
      return { action: 'sell', text: `Remove ${def.name}: +${money(def.cost * CONFIG.economy.sellRefund)}` };
    }
    return { action: 'blocked', text: 'Nothing to sell here' };
  }

  if (isWallTool(tool)) {
    const def = CONFIG.walls[tool];
    if (!isUnlocked(state, tool)) return { action: 'blocked', text: `${def.name} unlocks at level ${unlockFor(tool)?.level ?? '?'}` };
    return { action: 'draw', text: `Drag along grid lines to build: ${def.name}, ${money(def.cost)} per tile` };
  }

  // Floor tools paint under buildings too.
  if (isFloorKind(tool)) {
    const def = floorDef(tool);
    if (!isUnlocked(state, tool)) return { action: 'blocked', text: `${def.name} unlocks at level ${unlockFor(tool)?.level ?? '?'}` };
    if (floor) return { action: 'blocked', text: `${def.name} already here` };
    if (state.cash < def.cost) return { action: 'blocked', text: `Can't afford ${def.name} (${money(def.cost)})` };
    return { action: 'place', text: `Lay ${def.name}: ${money(def.cost)}` };
  }

  if (building) {
    if (categoryOf(building) === 'rack' && building.status === 'failed') {
      const cost = repairCost(building);
      const hours = CONFIG.economy.repairTicks / 60;
      if (state.cash < cost) return { action: 'blocked', text: `Can't afford repair (${money(cost)})` };
      return { action: 'repair', text: `Repair rack: ${money(cost)}, offline ${hours}h` };
    }
    const level = building.upgrade > 0 ? ` (level ${building.upgrade})` : '';
    const status = building.status === 'repairing' ? ', under repair' : '';
    return { action: 'inspect', text: `${buildingDef(building.kind).name}${level}${status}: click for details` };
  }

  const def = buildingDef(tool);
  if (!isUnlocked(state, tool)) {
    return { action: 'blocked', text: `${def.name} unlocks at level ${unlockFor(tool)?.level ?? '?'}` };
  }
  if (!canAfford(state, tool)) return { action: 'blocked', text: `Can't afford ${def.name} (${money(def.cost)})` };
  return { action: 'place', text: `Build ${def.name}: ${money(def.cost)}` };
}

// Returns what the click did, so the caller can open the building panel on 'inspect'.
export function applyTool(state: GameState, tool: Tool, x: number, y: number): ToolAction | null {
  const preview = previewTool(state, tool, x, y);
  if (!preview) return null;
  if (preview.action === 'place') {
    if (isFloorKind(tool)) placeFloor(state, tool, x, y);
    else if (tool !== 'sell' && !isWallTool(tool)) placeBuilding(state, tool, x, y);
  } else if (preview.action === 'sell') {
    if (getBuildingAt(state, x, y)) sellBuilding(state, x, y);
    else removeFloor(state, x, y);
  } else if (preview.action === 'repair') {
    repairRack(state, x, y);
  }
  return preview.action;
}
