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
  type ZoneKind,
} from '../config';
import { investedValue } from '../sim/buildings';
import { placeBuilding, placeFloor, removeFloor, repairRack, sellBuilding } from '../sim/commands';
import { canAfford, repairCost } from '../sim/economy';
import { isOwnedTile, lotAt, nextLotPrice, purchasableLots } from '../sim/lots';
import { isUnlocked, unlockFor } from '../sim/progression';
import { type Building, categoryOf, floorAt, type GameState, getBuildingAt } from '../sim/state';

// Zone tools paint a dragged rectangle of tiles; zone_clear erases zones.
export type ZoneTool = 'zone_server' | 'zone_staff' | 'zone_storage' | 'zone_clear';
export const ZONE_TOOLS: ZoneTool[] = ['zone_server', 'zone_staff', 'zone_storage', 'zone_clear'];

export type Tool = BuildingKind | FloorKind | WallKind | ZoneTool | 'sell' | 'move';
// inspect: clicking opens the building panel (stats, upgrades, sell).
// draw: wall and zone tools, which drag instead of clicking tiles.
export type ToolAction = 'place' | 'sell' | 'repair' | 'inspect' | 'blocked' | 'draw';

// Buildings added later without a hotkey are still selectable from the toolbar.
export const TOOL_HOTKEYS: Partial<Record<Tool, string>> = {
  rack_basic: 'R',
  power_basic: 'P',
  cooling_fan: 'C',
  ups_battery: 'F',
  zone_server: 'Z',
  wall_basic: 'B',
  sell: 'X',
  move: 'M',
};

export function isWallTool(tool: Tool): tool is WallKind {
  return tool !== 'sell' && tool !== 'move' && isWallKind(tool);
}

export function isZoneTool(tool: Tool): tool is ZoneTool {
  return (ZONE_TOOLS as string[]).includes(tool);
}

// The zone a zone tool paints (null erases).
export function zoneOfTool(tool: ZoneTool): ZoneKind | null {
  return tool === 'zone_clear' ? null : (tool.slice(5) as ZoneKind);
}

const ZONE_NAMES: Record<ZoneTool, string> = {
  zone_server: 'Server room',
  zone_staff: 'Staff room',
  zone_storage: 'Storage room',
  zone_clear: 'Clear zone',
};

export interface ToolPreview {
  action: ToolAction;
  text: string;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

export function toolName(tool: Tool): string {
  if (tool === 'sell') return 'Sell';
  if (tool === 'move') return 'Move';
  if (isZoneTool(tool)) return ZONE_NAMES[tool];
  if (isWallTool(tool)) return CONFIG.walls[tool].name;
  return isFloorKind(tool) ? floorDef(tool).name : buildingDef(tool).name;
}

export function toolCost(tool: Tool): number {
  if (tool === 'sell' || tool === 'move' || isZoneTool(tool)) return 0;
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

  // The move tool's second step (carrying a building) is previewMove.
  if (tool === 'move') {
    if (building) return { action: 'inspect', text: `Pick up ${buildingDef(building.kind).name} to move it (free)` };
    return { action: 'blocked', text: 'Click a building to pick it up' };
  }

  if (isWallTool(tool)) {
    const def = CONFIG.walls[tool];
    if (!isUnlocked(state, tool)) return { action: 'blocked', text: `${def.name} unlocks at level ${unlockFor(tool)?.level ?? '?'}` };
    const where = tool === 'door_outside' ? 'Click an outside wall to add a front door' : 'Drag along grid lines to build';
    return { action: 'draw', text: `${where}: ${def.name}, ${money(def.cost)} per tile. Placing on an existing wall swaps it` };
  }

  if (isZoneTool(tool)) {
    if (!isUnlocked(state, 'zones')) return { action: 'blocked', text: `Zones unlock at level ${unlockFor('zones')?.level ?? '?'}` };
    return { action: 'draw', text: `Drag to paint: ${ZONE_NAMES[tool]} (free)` };
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

// Where a carried building would go.
export function previewMove(state: GameState, carried: Building, x: number, y: number): ToolPreview {
  const name = buildingDef(carried.kind).name;
  if (!isOwnedTile(state, x, y)) return { action: 'blocked', text: `Can't move ${name} outside your rooms` };
  if (carried.x === x && carried.y === y) return { action: 'place', text: `Put ${name} back · Q to turn · Esc to cancel` };
  if (getBuildingAt(state, x, y)) return { action: 'blocked', text: 'Something is already here' };
  return { action: 'place', text: `Move ${name} here (free) · Q to turn · Esc to cancel` };
}

// Returns what the click did, so the caller can open the building panel on
// 'inspect'. rot is the facing for new buildings. The move tool is handled
// by the caller, which knows what is being carried.
export function applyTool(state: GameState, tool: Tool, x: number, y: number, rot = 0): ToolAction | null {
  if (tool === 'move') return null;
  const preview = previewTool(state, tool, x, y);
  if (!preview) return null;
  if (preview.action === 'place') {
    if (isFloorKind(tool)) placeFloor(state, tool, x, y);
    else if (tool !== 'sell' && !isWallTool(tool) && !isZoneTool(tool)) placeBuilding(state, tool, x, y, rot);
  } else if (preview.action === 'sell') {
    if (getBuildingAt(state, x, y)) sellBuilding(state, x, y);
    else removeFloor(state, x, y);
  } else if (preview.action === 'repair') {
    repairRack(state, x, y);
  }
  return preview.action;
}
