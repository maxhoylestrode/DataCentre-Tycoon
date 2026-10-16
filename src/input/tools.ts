// What the selected tool would do on a tile, and doing it. Pure logic over
// sim state and commands, so hover feedback and clicks always agree.

import { type BuildingKind, buildingDef, CONFIG, type FloorKind, floorDef, isFloorKind } from '../config';
import { investedValue } from '../sim/buildings';
import { placeBuilding, placeFloor, removeFloor, repairRack, sellBuilding } from '../sim/commands';
import { canAfford, repairCost } from '../sim/economy';
import { isUnlocked, unlockFor } from '../sim/progression';
import { categoryOf, floorAt, type GameState, getBuildingAt } from '../sim/state';

export type Tool = BuildingKind | FloorKind | 'sell';
// inspect: clicking opens the building panel (stats, upgrades, sell).
export type ToolAction = 'place' | 'sell' | 'repair' | 'inspect' | 'blocked';

// Buildings added later without a hotkey are still selectable from the toolbar.
export const TOOL_HOTKEYS: Partial<Record<Tool, string>> = {
  rack_basic: 'R',
  power_basic: 'P',
  cooling_fan: 'C',
  sell: 'X',
};

export interface ToolPreview {
  action: ToolAction;
  text: string;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

export function toolName(tool: Tool): string {
  if (tool === 'sell') return 'Sell';
  return isFloorKind(tool) ? floorDef(tool).name : buildingDef(tool).name;
}

export function toolCost(tool: Tool): number {
  if (tool === 'sell') return 0;
  return isFloorKind(tool) ? floorDef(tool).cost : buildingDef(tool).cost;
}

export function previewTool(state: GameState, tool: Tool, x: number, y: number): ToolPreview | null {
  if (state.bankrupt) return null;
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
    else if (tool !== 'sell') placeBuilding(state, tool, x, y);
  } else if (preview.action === 'sell') {
    if (getBuildingAt(state, x, y)) sellBuilding(state, x, y);
    else removeFloor(state, x, y);
  } else if (preview.action === 'repair') {
    repairRack(state, x, y);
  }
  return preview.action;
}
