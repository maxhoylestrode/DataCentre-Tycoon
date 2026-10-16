// What the selected tool would do on a tile, and doing it. Pure logic over
// sim state and commands, so hover feedback and clicks always agree.

import { type BuildingKind, buildingDef, CONFIG } from '../config';
import { placeBuilding, repairRack, sellBuilding } from '../sim/commands';
import { canAfford, repairCost } from '../sim/economy';
import { isUnlocked, unlockFor } from '../sim/progression';
import { categoryOf, type GameState, getBuildingAt } from '../sim/state';

export type Tool = BuildingKind | 'sell';
export type ToolAction = 'place' | 'sell' | 'repair' | 'blocked';

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

export function previewTool(state: GameState, tool: Tool, x: number, y: number): ToolPreview | null {
  if (state.bankrupt) return null;
  const building = getBuildingAt(state, x, y);

  if (tool === 'sell') {
    if (!building) return { action: 'blocked', text: 'Nothing to sell here' };
    const def = buildingDef(building.kind);
    return { action: 'sell', text: `Sell ${def.name}: +${money(def.cost * CONFIG.economy.sellRefund)}` };
  }

  if (building) {
    if (categoryOf(building) === 'rack' && building.status === 'failed') {
      const cost = repairCost(building);
      const hours = CONFIG.economy.repairTicks / 60;
      if (state.cash < cost) return { action: 'blocked', text: `Can't afford repair (${money(cost)})` };
      return { action: 'repair', text: `Repair rack: ${money(cost)}, offline ${hours}h` };
    }
    if (building.status === 'repairing') return { action: 'blocked', text: 'Under repair' };
    return { action: 'blocked', text: `${buildingDef(building.kind).name} already here` };
  }

  const def = buildingDef(tool);
  if (!isUnlocked(state, tool)) {
    return { action: 'blocked', text: `${def.name} unlocks at level ${unlockFor(tool)?.level ?? '?'}` };
  }
  if (!canAfford(state, tool)) return { action: 'blocked', text: `Can't afford ${def.name} (${money(def.cost)})` };
  return { action: 'place', text: `Build ${def.name}: ${money(def.cost)}` };
}

export function applyTool(state: GameState, tool: Tool, x: number, y: number): void {
  const preview = previewTool(state, tool, x, y);
  if (!preview) return;
  if (preview.action === 'place' && tool !== 'sell') placeBuilding(state, tool, x, y);
  else if (preview.action === 'sell') sellBuilding(state, x, y);
  else if (preview.action === 'repair') repairRack(state, x, y);
}
