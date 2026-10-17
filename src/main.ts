import { CONFIG, type Difficulty, isFloorKind } from './config';
import { advanceClock, createClock } from './sim/clock';
import {
  buyLot,
  buyStyle,
  cancelContract,
  fireStaff,
  moveBuilding,
  moveGroup,
  paintZone,
  placeBuilding,
  placeFloor,
  placeWall,
  refurbishRack,
  removeFloor,
  removeWall,
  repairRack,
  rotateBuilding,
  sellBuilding,
  setAutoSign,
  setBatteryMode,
  setDifficulty,
  hireCandidate,
  payRansom,
  trainStaff,
  setSpeed,
  signContract,
  startResearch,
  togglePause,
  upgradeBuilding,
  upgradeAllRacks,
  upgradeMax,
  upgradePart,
  upgradeUplink,
  wallPlacementCost,
} from './sim/commands';
import { wallAt } from './sim/walls';
import { type Edge, edgesBetween, nearestCorner, nearestEdge } from './input/walls';
import { WallLayer } from './render/walls';
import { type Building, createInitialState, floorAt, type GameState, getBuildingAt, isRunning, racksOf } from './sim/state';
import { CameraRig } from './render/camera';
import { HoverHighlight, LotsLayer, type Tile, TilePicker, tileToWorld } from './render/grid';
import { HeatOverlay } from './render/heatmap';
import { BuildingLayer, FloorLayer, MultiblockLayer } from './render/models';
import { PeopleLayer } from './render/people';
import { createScene } from './render/scene';
import { ZoneLayer, ZonePreview } from './render/zones';
import { attachInput } from './input/input';
import {
  applyTool,
  isWallTool,
  isZoneTool,
  previewMove,
  previewTool,
  type Tool,
  toolCost,
  toolName,
  type ToolPreview,
  zoneOfTool,
} from './input/tools';
import { exportSaveFile, loadGame, loadSettings, readSaveFile, saveGame, saveSettings } from './io/storage';
import { isUnlocked, totalXpForLevel } from './sim/progression';
import { isOwnedTile, lotAt, lotSize, purchasableLots } from './sim/lots';
import { investedValue } from './sim/buildings';
import { sellCompany } from './sim/legacy';
import { hourOf } from './sim/daynight';
import { incomePerTick } from './sim/economy';
import { applyUndo, makeEntry, takeSnapshot, type UndoEntry } from './sim/undo';
import { Sound, type SoundName } from './audio/sound';
import { RoomSale } from './ui/rooms';
import { Announcer } from './ui/announcer';
import { BuildingPanel } from './ui/buildingPanel';
import { ContractsPanel } from './ui/contracts';
import { GoalsPanel } from './ui/goals';
import { GuidePanel } from './ui/guide';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { NetworkPanel } from './ui/networkPanel';
import { ResearchPanel } from './ui/research';
import { StaffPanel } from './ui/staff';
import { StatsPanel } from './ui/stats';
import { RackListPanel } from './ui/racks';
import { StylePanel } from './ui/style';
import { Toasts } from './ui/toasts';
import { Toolbar, toolUnlocked } from './ui/toolbar';

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);
// Each new game gets its own random seed (the sim itself never calls
// Math.random) and simulated staff and clients.
const newGame = (difficulty: Difficulty = 'normal'): GameState =>
  createInitialState(undefined, undefined, randomSeed(), { staffSim: true, liveWorld: true, difficulty });

const settings = loadSettings();
const loaded = loadGame();
let state: GameState = loaded?.ok ? loaded.state : newGame();
const clock = createClock();
const sound = new Sound(settings.sound, settings.volume);
const play = (name: SoundName): void => sound.play(name);

const container = document.getElementById('app') as HTMLElement;
const { renderer, scene, room } = createScene(container);
const rig = new CameraRig(container.clientWidth / container.clientHeight, state.width, state.height);
// Start looking at the middle of the starting room, not the middle of the map.
const startLot = lotSize(state);
const startCentre = tileToWorld(state.width, state.height, startLot.w / 2 - 0.5, startLot.h / 2 - 0.5);
rig.focus(startCentre.x, startCentre.z);
const picker = new TilePicker(rig.camera, renderer.domElement, state.width, state.height);

const hover = new HoverHighlight(state.width, state.height);
// Marks the building whose panel is open.
const selection = new HoverHighlight(state.width, state.height);
const heat = new HeatOverlay(state.width, state.height);
const buildings = new BuildingLayer();
const floor = new FloorLayer();
const walls = new WallLayer();
const lots = new LotsLayer();
const zones = new ZoneLayer();
const boxPreview = new ZonePreview();
const people = new PeopleLayer();
const multiblocks = new MultiblockLayer();
scene.add(
  floor.group,
  zones.group,
  boxPreview.mesh,
  walls.group,
  lots.group,
  heat.mesh,
  selection.mesh,
  hover.mesh,
  multiblocks.group,
  buildings.group,
  people.group,
);

// UI state: lives here, not in the sim.
let tool: Tool = 'rack_basic';
// Facing for the next building placed (quarter turns), changed with Q.
let placeRot = 0;
let hoveredTile: Tile | null = null;
// Floor point under the cursor in grid units, for wall edges.
let hoverGrid: { gx: number; gy: number } | null = null;
// Corner a wall drag started from, and the corner it's at now.
let wallDrag: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
// Tiles a box drag (zones, bulk place/sell, group select) started and ended on.
let boxDrag: { start: Tile; end: Tile } | null = null;
// What the move tool is carrying: building ids, and the tile they were
// picked up from (the group moves by how far the cursor is from it).
let carrying: { ids: number[]; anchor: Tile } | null = null;

// How close (in tiles) the cursor must be to a grid line to pick that edge.
const EDGE_PICK = 0.3;
const SELL_PICK = 0.2;
const FACING = ['↓', '→', '↑', '←'];

// --- Undo -------------------------------------------------------------------
// Layout actions are recorded; Ctrl+Z puts them back. Entries expire so undo
// stays a quick fix, not a way to rewind time.
const UNDO_LIMIT = 30;
const UNDO_SECONDS = 60;
let undoStack: { entry: UndoEntry; at: number }[] = [];

function record(label: string, action: () => void): boolean {
  const before = takeSnapshot(state);
  action();
  const entry = makeEntry(state, before, label);
  if (!entry) return false;
  undoStack.push({ entry, at: performance.now() });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  return true;
}

function pruneUndo(): void {
  const cutoff = performance.now() - UNDO_SECONDS * 1000;
  undoStack = undoStack.filter((u) => u.at >= cutoff);
}

function undo(): void {
  pruneUndo();
  const last = undoStack.pop();
  if (!last || state.bankrupt) {
    play('error');
    return;
  }
  applyUndo(state, last.entry);
  carrying = null;
  toasts.show(`Undone: ${last.entry.label}`, 'goal');
  play('undo');
}

// --- Walls ------------------------------------------------------------------

// The wall edges a click/drag would build right now. A click (no drag)
// builds the single edge nearest the cursor.
function plannedWallEdges(): Edge[] {
  if (wallDrag) {
    const line = edgesBetween(wallDrag.start, wallDrag.end);
    if (line.length > 0) return line;
  }
  if (!hoverGrid) return [];
  const near = nearestEdge(hoverGrid.gx, hoverGrid.gy);
  return near.distance <= EDGE_PICK ? [near.edge] : [];
}

// Which planned edges can actually be built (or swapped), given cash for the
// whole run.
function checkWallEdges(edges: Edge[]): { edge: Edge; ok: boolean; cost: number }[] {
  if (!isWallTool(tool)) return [];
  const kind = tool;
  let cash = state.cash;
  return edges.map((edge) => {
    const cost = wallPlacementCost(state, kind, edge.x, edge.y, edge.dir);
    const ok = cost !== null && isUnlocked(state, kind) && cash >= cost;
    if (ok) cash -= cost;
    return { edge, ok, cost: cost ?? 0 };
  });
}

// A wall right under the cursor, for the Sell tool.
function wallUnderCursor(): Edge | null {
  if (!hoverGrid) return null;
  const near = nearestEdge(hoverGrid.gx, hoverGrid.gy);
  if (near.distance > SELL_PICK) return null;
  return wallAt(state, near.edge.x, near.edge.y, near.edge.dir) ? near.edge : null;
}

// --- Boxes ------------------------------------------------------------------

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boxRect(): Rect | null {
  if (!boxDrag) return null;
  const [a, b] = [boxDrag.start, boxDrag.end];
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

const isSingleTile = (r: Rect): boolean => r.x0 === r.x1 && r.y0 === r.y1;

function tilesIn(r: Rect): Tile[] {
  const out: Tile[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push({ x, y });
  return out;
}

// Where a box of buildings goes: every tile for a thin box (1-2 wide), or
// rows with an aisle between them for a wide one, so staff can reach each one.
function placementTiles(r: Rect): Tile[] {
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  if (Math.min(w, h) <= 2) return tilesIn(r);
  const rowsAlongX = w >= h;
  return tilesIn(r).filter((t) => (rowsAlongX ? (t.y - r.y0) % 2 === 0 : (t.x - r.x0) % 2 === 0));
}

const isBuildTool = (t: Tool): boolean => t !== 'sell' && t !== 'move' && !isWallTool(t) && !isZoneTool(t);

// What a box would do with the current tool: a summary for the HUD.
function planBox(r: Rect): { text: string; colour: number } {
  if (isZoneTool(tool)) {
    const n = tilesIn(r).length;
    return { text: `Paint ${n} tile${n > 1 ? 's' : ''}`, colour: 0 };
  }
  if (tool === 'sell') {
    const inside = state.buildings.filter((b) => b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1);
    const refund = inside.reduce((s, b) => s + investedValue(b) * CONFIG.economy.sellRefund, 0);
    return { text: `Sell ${inside.length} building${inside.length === 1 ? '' : 's'}: +£${Math.round(refund).toLocaleString('en-GB')} (Ctrl+Z undoes)`, colour: 0xe0565b };
  }
  if (tool === 'move') {
    const n = state.buildings.filter((b) => b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1).length;
    return { text: `Pick up ${n} building${n === 1 ? '' : 's'} to move together`, colour: 0x4aa8ff };
  }
  // Building or floor tool: how many fit and can be afforded.
  const cost = toolCost(tool);
  const free = placementTiles(r).filter((t) =>
    isOwnedTile(state, t.x, t.y) && (isFloorKind(tool) ? !floorAt(state, t.x, t.y) : !getBuildingAt(state, t.x, t.y)),
  );
  const affordable = cost > 0 ? Math.min(free.length, Math.floor(state.cash / cost)) : free.length;
  const total = affordable * cost;
  const short = affordable < free.length ? ` (cash for ${affordable})` : '';
  return {
    text: `${affordable} × ${toolName(tool)}: £${Math.round(total).toLocaleString('en-GB')}${short}`,
    colour: affordable > 0 ? 0x3fbf6a : 0xe0565b,
  };
}

function applyBox(r: Rect): void {
  if (isZoneTool(tool)) {
    const kind = zoneOfTool(tool);
    if (record(kind ? 'paint zone' : 'clear zone', () => tilesIn(r).forEach((t) => paintZone(state, kind, t.x, t.y)))) play('click');
    return;
  }
  if (tool === 'sell') {
    const inside = state.buildings.filter((b) => b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1);
    const done = record(`sell ${inside.length} buildings`, () => {
      for (const b of inside) sellBuilding(state, b.x, b.y);
      for (const t of tilesIn(r)) if (floorAt(state, t.x, t.y) && !getBuildingAt(state, t.x, t.y)) removeFloor(state, t.x, t.y);
    });
    play(done ? 'sell' : 'error');
    return;
  }
  if (tool === 'move') {
    const ids = state.buildings.filter((b) => b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1).map((b) => b.id);
    if (ids.length) {
      carrying = { ids, anchor: boxDrag!.end };
      play('click');
    }
    return;
  }
  const kind = tool;
  if (isWallTool(kind) || isZoneTool(kind)) return;
  const tiles = placementTiles(r);
  const done = record(`build ${toolName(kind)}`, () => {
    for (const t of tiles) {
      if (isFloorKind(kind)) placeFloor(state, kind, t.x, t.y);
      else placeBuilding(state, kind, t.x, t.y, placeRot);
    }
  });
  play(done ? 'place' : 'error');
}

// --- Tools ------------------------------------------------------------------

// Locked tools and the locked heat map can't be selected.
const selectTool = (t: Tool): void => {
  if (!toolUnlocked(state, t)) return;
  tool = t;
  carrying = null;
  play('click');
};
const toggleHeat = (): void => {
  if (isUnlocked(state, 'heat_map')) heat.visible = !heat.visible;
};

const carriedBuildings = (): Building[] =>
  carrying ? state.buildings.filter((b) => carrying!.ids.includes(b.id)) : [];

const pickUp = (b: Building): void => {
  tool = 'move';
  carrying = { ids: [b.id], anchor: { x: b.x, y: b.y } };
  placeRot = b.rot;
  play('click');
};

// Puts down whatever the move tool is carrying, at the hovered tile.
function dropCarried(tile: Tile): void {
  const group = carriedBuildings();
  if (!carrying || group.length === 0) return;
  const dx = tile.x - carrying.anchor.x;
  const dy = tile.y - carrying.anchor.y;
  let ok: boolean;
  if (group.length === 1) {
    const b = group[0]!;
    ok = record(`move ${b.kind}`, () => void moveBuilding(state, b.x, b.y, b.x + dx, b.y + dy, placeRot));
    ok = ok || (dx === 0 && dy === 0);
  } else {
    ok = (dx === 0 && dy === 0) || record(`move ${group.length} buildings`, () => void moveGroup(state, carrying!.ids, dx, dy));
  }
  if (ok) {
    carrying = null;
    play('move');
  } else play('error');
}

// The tile under the cursor, except that a "!" badge over a failed building
// counts as that building's tile: the badge floats above the rack, so it
// usually sits over a different tile.
function pickWithAlerts(cx: number, cy: number): Tile | null {
  const alert = picker.pickObject(cx, cy, buildings.alerts());
  const b = alert ? state.buildings.find((x) => x.id === alert.userData.buildingId) : undefined;
  return b ? { x: b.x, y: b.y } : picker.pick(cx, cy);
}

// A click (or a box that's a single tile) with the current tool.
function handleClick(cx: number, cy: number): void {
  if (tool === 'sell') {
    const wall = wallUnderCursor();
    if (wall) {
      if (record('remove wall', () => void removeWall(state, wall.x, wall.y, wall.dir))) play('sell');
      return;
    }
  }
  const tile = carrying ? picker.pick(cx, cy) : pickWithAlerts(cx, cy);
  if (!tile) return;
  // Clicking a member of staff (when the click wouldn't build anything) opens their card.
  if (!carrying && previewTool(state, tool, tile.x, tile.y)?.action !== 'place') {
    const staffId = PeopleLayer.staffIdOf(picker.pickObject(cx, cy, people.staffFigures(), true));
    if (staffId !== null) {
      staffPanel.show(staffId);
      play('click');
      return;
    }
  }
  if (tool === 'move') {
    if (carrying) dropCarried(tile);
    else {
      const b = getBuildingAt(state, tile.x, tile.y);
      if (b) pickUp(b);
    }
    return;
  }
  // Clicking a room for sale offers to buy it.
  if (!isOwnedTile(state, tile.x, tile.y)) {
    const lot = lotAt(state, tile.x, tile.y);
    if (lot && purchasableLots(state).some((l) => l.id === lot.id)) roomSale.ask(lot.id);
    return;
  }
  const preview = previewTool(state, tool, tile.x, tile.y);
  let action: ReturnType<typeof applyTool> = null;
  if (preview?.action === 'place' || preview?.action === 'sell') {
    record(preview.action === 'place' ? `build ${toolName(tool)}` : 'sell', () => {
      action = applyTool(state, tool, tile.x, tile.y, placeRot);
    });
  } else {
    // Repairs, inspecting and blocked clicks aren't undoable.
    action = applyTool(state, tool, tile.x, tile.y, placeRot);
  }
  if (action === 'place') play('place');
  else if (action === 'sell') play('sell');
  else if (action === 'repair') play('cash');
  else if (action === 'blocked') play('error');
  const clicked = state.buildings.find((b) => b.x === tile.x && b.y === tile.y);
  if (action === 'inspect' && clicked) buildingPanel.show(clicked.id);
  else if (action !== 'repair') buildingPanel.close();
}

// --- Panels -----------------------------------------------------------------

const toasts = new Toasts(document.body);
const announcer = new Announcer(toasts, state, (cue) => play(cue));
const goals = new GoalsPanel(document.body);
const contracts = new ContractsPanel(document.body, {
  onSign: (id) => {
    if (signContract(state, id).ok) play('cash');
  },
  onCancel: (id) => cancelContract(state, id),
  onPayRansom: () => {
    if (payRansom(state, incomePerTick(state)).ok) play('cash');
    else play('error');
  },
  onAutoSign: () => {
    setAutoSign(state, !state.contracts.autoSign);
    play('click');
  },
});
const toggleContracts = (): void => {
  if (isUnlocked(state, 'contract_board')) contracts.toggle();
};
// The panel works with building ids; commands take tile coordinates.
const withBuilding = (id: number, run: (x: number, y: number) => void): void => {
  const b = state.buildings.find((x) => x.id === id);
  if (b) run(b.x, b.y);
};
const rackList = new RackListPanel(document.body, {
  onUpgradeMax: (id) => withBuilding(id, (x, y) => play(upgradeMax(state, x, y) > 0 ? 'cash' : 'error')),
  onUpgradeAll: () => {
    const n = upgradeAllRacks(state);
    play(n > 0 ? 'cash' : 'error');
    if (n > 0) toasts.show(`<b>Upgraded ${n} part${n > 1 ? 's' : ''}</b> across your racks.`, 'goal');
  },
  onRefurbish: (id) => withBuilding(id, (x, y) => play(refurbishRack(state, x, y).ok ? 'cash' : 'error')),
  onRepair: (id) => withBuilding(id, (x, y) => play(repairRack(state, x, y).ok ? 'cash' : 'error')),
  onFocus: (id) => {
    const b = state.buildings.find((x) => x.id === id);
    if (!b) return;
    const p = tileToWorld(state.width, state.height, b.x, b.y);
    rig.focus(p.x, p.z);
    buildingPanel.show(id);
  },
});
const toggleAgeBars = (): void => {
  buildings.showAgeBars = !buildings.showAgeBars;
  toasts.show(`Rack condition bars ${buildings.showAgeBars ? 'on' : 'off'}`, 'goal');
};
// Panel actions that change a building can be undone.
const recorded = (label: string, id: number, run: (x: number, y: number) => void, cue: SoundName = 'cash'): void =>
  withBuilding(id, (x, y) => {
    if (record(label, () => run(x, y))) play(cue);
  });
const buildingPanel = new BuildingPanel(document.body, {
  onUpgrade: (id) => recorded('upgrade', id, (x, y) => void upgradeBuilding(state, x, y)),
  onUpgradePart: (id, slot) => recorded('upgrade part', id, (x, y) => void upgradePart(state, x, y, slot)),
  onUpgradeMax: (id) => recorded('upgrade max', id, (x, y) => void upgradeMax(state, x, y)),
  onSell: (id) => recorded('sell', id, (x, y) => void sellBuilding(state, x, y), 'sell'),
  onRepair: (id) => withBuilding(id, (x, y) => {
    if (repairRack(state, x, y).ok) play('cash');
  }),
  onRotate: (id) => recorded('rotate', id, (x, y) => void rotateBuilding(state, x, y), 'click'),
  onMove: (id) => {
    const b = state.buildings.find((x) => x.id === id);
    if (!b) return;
    pickUp(b);
    buildingPanel.close();
  },
  onRefurbish: (id) => withBuilding(id, (x, y) => {
    if (refurbishRack(state, x, y).ok) play('cash');
  }),
  onBatteryMode: (mode) => {
    setBatteryMode(state, mode);
    play('click');
  },
});
const stylePanel = new StylePanel(document.body, { onChoose: (id) => buyStyle(state, id) });
const toggleStyle = (): void => {
  if (isUnlocked(state, 'room_styles')) stylePanel.toggle();
};
const staffPanel = new StaffPanel(document.body, {
  onHire: (id) => {
    if (hireCandidate(state, id).ok) play('cash');
    else play('error');
  },
  onFire: (id) => fireStaff(state, id),
  onTrain: (id, specialism) => {
    if (trainStaff(state, id, specialism).ok) play('research');
    else play('error');
  },
});
const networkPanel = new NetworkPanel(document.body, {
  onUpgrade: () => {
    if (upgradeUplink(state).ok) play('cash');
  },
});
const researchPanel = new ResearchPanel(document.body, {
  onStart: (id) => {
    if (startResearch(state, id).ok) play('research');
  },
  onSellCompany: () => {
    const next = sellCompany(state, randomSeed());
    if (!next) return;
    const points = next.legacy.points - state.legacy.points;
    startNewGame(next);
    toasts.show(`<b>Company sold!</b><br>+${points} legacy points. Your new company starts with the bonus.`, 'level');
    play('level');
  },
});
const toggleResearch = (): void => {
  if (isUnlocked(state, 'research')) researchPanel.toggle();
};
const statsPanel = new StatsPanel(document.body);
const guide = new GuidePanel(document.body);
const roomSale = new RoomSale(document.body, {
  onBuy: (id) => {
    if (buyLot(state, id).ok) play('cash');
  },
});

// First time playing: open the guide once.
if (!settings.seenGuide) {
  guide.toggle(true);
  settings.seenGuide = true;
  saveSettings(settings);
}

// Swaps in a new game (fresh, or the next one after selling the company).
function startNewGame(next: GameState = newGame(state.difficulty)): void {
  state = next;
  clock.accumulator = 0;
  buildings.clear();
  floor.clear();
  walls.clear();
  zones.clear();
  people.clear();
  tool = 'rack_basic';
  heat.visible = false;
  undoStack = [];
  closePanels();
  rig.focus(startCentre.x, startCentre.z);
  announcer.reset(state);
  persist();
}

// Set while reloading after an import, so the page-hide autosave can't
// overwrite the imported save with the old game.
let saveBlocked = false;
let pendingImport: GameState | null = null;

const menu = new Menu(document.body, settings, {
  onSaveNow: () => persist(),
  onExport: () => exportSaveFile(state),
  onImportFile: async (file) => {
    const result = await readSaveFile(file);
    if (!result.ok) return result.error;
    pendingImport = result.state;
    return null;
  },
  onConfirmImport: () => {
    if (!pendingImport) return;
    saveGame(pendingImport);
    saveBlocked = true;
    // Reload so the scene is rebuilt for the imported room.
    location.reload();
  },
  onSetAutosave: (on) => {
    settings.autosave = on;
    saveSettings(settings);
  },
  onSetSound: (on) => {
    settings.sound = on;
    sound.setEnabled(on);
    saveSettings(settings);
  },
  onSetDifficulty: (difficulty) => {
    setDifficulty(state, difficulty);
    toasts.show(`<b>Difficulty: ${CONFIG.difficulty[difficulty].name}</b>`, 'goal');
  },
  onSetDayLighting: (on) => {
    settings.dayLighting = on;
    saveSettings(settings);
  },
  onSetVolume: (volume) => {
    settings.volume = volume;
    sound.setVolume(volume);
    saveSettings(settings);
  },
  onNewGame: () => startNewGame(),
});

function persist(): boolean {
  if (saveBlocked) return false;
  const ok = saveGame(state);
  if (ok) menu.markSaved(new Date());
  return ok;
}

if (loaded && !loaded.ok) {
  menu.say(`Couldn't load your save (${loaded.error}) Started a new game; the old save was kept as a backup.`, true);
} else if (loaded?.ok && loaded.savedAt) {
  menu.markSaved(new Date(loaded.savedAt));
}

const autosave = (): void => {
  if (settings.autosave) persist();
};
setInterval(autosave, CONFIG.save.autosaveSeconds * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave();
});
window.addEventListener('pagehide', autosave);

const hud = new Hud(document.body, {
  onTogglePause: () => togglePause(state),
  onSetSpeed: (speed) => setSpeed(state, speed),
  onRestart: () => startNewGame(),
  onOpenNetwork: () => networkPanel.toggle(),
});

const toggleWallHeight = (): void => {
  if (isUnlocked(state, 'wall_basic')) walls.tall = !walls.tall;
};
const toolbar = new Toolbar(document.body, {
  onSelectTool: selectTool,
  onToggleHeat: toggleHeat,
  onToggleContracts: toggleContracts,
  onToggleStyle: toggleStyle,
  onToggleWallHeight: toggleWallHeight,
  onToggleStaff: () => staffPanel.toggle(),
  onToggleGuide: () => guide.toggle(),
  onToggleResearch: toggleResearch,
  onToggleStats: () => statsPanel.toggle(),
  onToggleRackList: () => rackList.toggle(),
  onToggleAgeBars: toggleAgeBars,
  onUndo: undo,
});

function closePanels(): void {
  rackList.toggle(false);
  carrying = null;
  toolbar.close();
  buildingPanel.close();
  contracts.toggle(false);
  stylePanel.toggle(false);
  staffPanel.toggle(false);
  networkPanel.toggle(false);
  researchPanel.toggle(false);
  statsPanel.toggle(false);
  guide.toggle(false);
  roomSale.close();
}

const updateInput = attachInput(renderer.domElement, rig, {
  onHover: (cx, cy) => {
    hoveredTile = carrying ? picker.pick(cx, cy) : pickWithAlerts(cx, cy);
    hoverGrid = picker.pickGrid(cx, cy);
  },
  onHoverEnd: () => {
    hoveredTile = null;
    hoverGrid = null;
  },
  // Walls and zones always draw. With a mouse, building, sell and move tools
  // drag a box too; on touch one finger keeps panning for those.
  isDrawMode: (pointerType) => {
    if (!toolUnlocked(state, tool)) return false;
    if (isWallTool(tool) || isZoneTool(tool)) return true;
    if (pointerType === 'touch') return false;
    if (tool === 'move') return carrying === null;
    return true;
  },
  onDrawStart: (cx, cy) => {
    if (isWallTool(tool)) {
      const grid = picker.pickGrid(cx, cy);
      if (!grid) return;
      const corner = nearestCorner(grid.gx, grid.gy);
      wallDrag = { start: corner, end: corner };
      return;
    }
    const t = picker.pick(cx, cy);
    if (t) boxDrag = { start: t, end: t };
  },
  onDrawMove: (cx, cy) => {
    if (boxDrag) {
      const t = picker.pick(cx, cy);
      if (t) boxDrag.end = t;
      return;
    }
    const grid = picker.pickGrid(cx, cy);
    if (wallDrag && grid) wallDrag.end = nearestCorner(grid.gx, grid.gy);
  },
  onDrawEnd: (cx, cy, cancelled) => {
    if (!cancelled && isWallTool(tool)) {
      const planned = checkWallEdges(plannedWallEdges()).filter((p) => p.ok);
      const kind = tool;
      if (record('build walls', () => planned.forEach(({ edge }) => placeWall(state, kind, edge.x, edge.y, edge.dir)))) play('place');
    } else if (!cancelled && boxDrag) {
      const r = boxRect()!;
      // A box that never left its tile is just a click (zones paint it).
      if (isSingleTile(r) && !isZoneTool(tool)) handleClick(cx, cy);
      else applyBox(r);
    }
    wallDrag = null;
    boxDrag = null;
  },
  onToggleWallHeight: toggleWallHeight,
  onToggleStaff: () => staffPanel.toggle(),
  onToggleGuide: () => guide.toggle(),
  onToggleResearch: toggleResearch,
  onToggleStats: () => statsPanel.toggle(),
  onToggleRackList: () => rackList.toggle(),
  onUndo: undo,
  onRotate: () => {
    // Rotates the building whose panel is open, otherwise the next placement
    // (or the building being carried).
    const selected = carrying === null ? buildingPanel.update(state) : null;
    if (selected) record('rotate', () => void rotateBuilding(state, selected.x, selected.y));
    else placeRot = (placeRot + 1) % 4;
    play('click');
  },
  // Esc first drops a carried building back where it was, then closes panels.
  onEscape: () => {
    if (carrying !== null) carrying = null;
    else closePanels();
  },
  onClick: handleClick,
  onTogglePause: () => togglePause(state),
  onSetSpeed: (speed) => setSpeed(state, speed),
  onSelectTool: selectTool,
  onToggleHeat: toggleHeat,
  onToggleContracts: toggleContracts,
  onToggleStyle: toggleStyle,
});

// Dev-only console helpers for testing (stripped from production builds).
// e.g. dct.level(6) to reach the contract board, dct.cash(50000).
if (import.meta.env.DEV) {
  Object.assign(window, {
    dct: {
      get state() {
        return state;
      },
      level: (n: number) => void (state.progress.xp = totalXpForLevel(n)),
      cash: (n: number) => void (state.cash += n),
    },
  });
}

// Installable web app: the service worker caches the game so it also opens
// offline. Production only, so it never caches the dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the game works without it, just not offline.
    });
  });
}

window.addEventListener('resize', () => {
  renderer.setSize(container.clientWidth, container.clientHeight);
  rig.resize(container.clientWidth / container.clientHeight);
});

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  updateInput(dt);
  advanceClock(clock, state, dt);
  pruneUndo();

  // The move tool: what's being carried, drawn at the cursor.
  const carried = tool === 'move' ? carriedBuildings() : [];
  if (carried.length === 0) carrying = null; // e.g. sold or the game restarted
  let preview: ToolPreview | null = null;
  if (hoveredTile && carried.length === 1) {
    const b = carried[0]!;
    const target = { x: b.x + hoveredTile.x - carrying!.anchor.x, y: b.y + hoveredTile.y - carrying!.anchor.y };
    preview = previewMove(state, b, target.x, target.y);
  } else if (hoveredTile && carried.length > 1) {
    preview = { action: 'place', text: `Move ${carried.length} buildings here (free) · Esc to cancel` };
  } else if (hoveredTile) preview = previewTool(state, tool, hoveredTile.x, hoveredTile.y);
  if (preview?.action === 'place' && isBuildTool(tool) && !carried.length) {
    preview = { ...preview, text: `${preview.text} · facing ${FACING[placeRot]} (Q) · drag for many` };
  }
  const offset = carrying && hoveredTile ? { x: hoveredTile.x - carrying.anchor.x, y: hoveredTile.y - carrying.anchor.y } : { x: 0, y: 0 };
  buildings.carry(carried.map((b) => ({ id: b.id, x: b.x + offset.x, y: b.y + offset.y, rot: carried.length === 1 ? placeRot : b.rot })));

  // Walls and boxes get their own previews: a ghost wall or a coloured
  // rectangle, with a cost summary instead of a tile highlight.
  let ghosts: { edge: Edge; ok: boolean }[] = [];
  const sellWall = tool === 'sell' && !boxDrag ? wallUnderCursor() : null;
  if (sellWall) {
    const kind = wallAt(state, sellWall.x, sellWall.y, sellWall.dir)!.kind;
    const refund = CONFIG.walls[kind].cost * CONFIG.economy.sellRefund;
    preview = { action: 'draw', text: `Remove ${CONFIG.walls[kind].name}: +£${refund}` };
    ghosts = [{ edge: sellWall, ok: false }];
  } else if (isWallTool(tool) && isUnlocked(state, tool)) {
    const planned = checkWallEdges(plannedWallEdges());
    ghosts = planned;
    const buildable = planned.filter((g) => g.ok);
    if (wallDrag && planned.length > 0) {
      const total = buildable.reduce((sum, g) => sum + g.cost, 0);
      preview = { action: 'draw', text: `${buildable.length} × ${CONFIG.walls[tool].name}: £${Math.round(total).toLocaleString('en-GB')}` };
    }
  }
  walls.showGhost(ghosts, state);
  const rect = boxRect();
  if (rect && (!isSingleTile(rect) || isZoneTool(tool))) {
    const plan = planBox(rect);
    if (isZoneTool(tool)) boxPreview.show(state, rect, zoneOfTool(tool));
    else boxPreview.showBox(state, rect, plan.colour);
    preview = { action: 'draw', text: plan.text };
  } else boxPreview.showBox(state, null, 0);

  // Server-room hum: louder with more running racks, quiet when paused.
  const running = racksOf(state).filter(isRunning).length;
  sound.setAmbient(state.paused || state.bankrupt ? 0.15 : Math.min(1, 0.25 + running / 60));

  buildings.sync(state, dt);
  floor.sync(state);
  walls.sync(state);
  zones.sync(state, isZoneTool(tool));
  people.sync(state, dt);
  multiblocks.sync(state);
  lots.update(state);
  room.update(state);
  room.setTimeOfDay(settings.dayLighting && state.liveWorld ? hourOf(state.tick) : null);
  room.follow(rig.target);
  roomSale.update(state, rig.camera, renderer.domElement);
  heat.update(state);
  hover.set(preview && preview.action !== 'draw' ? hoveredTile : null, preview?.action ?? 'place');
  hud.update(state, hoveredTile, preview);
  toolbar.update(state, tool, {
    heat: heat.visible,
    contracts: contracts.open,
    staff: staffPanel.open,
    research: researchPanel.open,
    stats: statsPanel.open,
    racklist: rackList.open,
    agebars: buildings.showAgeBars,
    style: stylePanel.open,
    wallHeight: walls.tall,
    guide: guide.open,
    undo: undoStack.length > 0,
  });
  goals.update(state);
  contracts.update(state);
  stylePanel.update(state);
  staffPanel.update(state);
  networkPanel.update(state);
  researchPanel.update(state);
  statsPanel.update(state);
  rackList.update(state);
  const selected = buildingPanel.update(state);
  selection.set(selected ? { x: selected.x, y: selected.y } : null, 'inspect');
  announcer.update(state);
  menu.update(state.difficulty);
  renderer.render(scene, rig.camera);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
