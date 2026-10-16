import { CONFIG } from './config';
import { advanceClock, createClock } from './sim/clock';
import {
  buyLot,
  buyStyle,
  cancelContract,
  repairRack,
  sellBuilding,
  setSpeed,
  signContract,
  togglePause,
  placeWall,
  removeWall,
  upgradeBuilding,
  upgradePart,
} from './sim/commands';
import { isInteriorEdge, isRoomBoundaryEdge, wallAt } from './sim/walls';
import { type Edge, edgesBetween, nearestCorner, nearestEdge } from './input/walls';
import { WallLayer } from './render/walls';
import { createInitialState, type GameState } from './sim/state';
import { CameraRig } from './render/camera';
import { HoverHighlight, LotsLayer, type Tile, TilePicker, tileToWorld } from './render/grid';
import { HeatOverlay } from './render/heatmap';
import { BuildingLayer, FloorLayer } from './render/models';
import { createScene } from './render/scene';
import { attachInput } from './input/input';
import { applyTool, isWallTool, previewTool, type Tool, type ToolPreview } from './input/tools';
import { exportSaveFile, loadGame, loadSettings, readSaveFile, saveGame, saveSettings } from './io/storage';
import { isUnlocked, totalXpForLevel } from './sim/progression';
import { isOwnedTile, lotAt, lotSize, purchasableLots } from './sim/lots';
import { RoomSale } from './ui/rooms';
import { Announcer } from './ui/announcer';
import { BuildingPanel } from './ui/buildingPanel';
import { ContractsPanel } from './ui/contracts';
import { GoalsPanel } from './ui/goals';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { StylePanel } from './ui/style';
import { Toasts } from './ui/toasts';
import { Toolbar } from './ui/toolbar';

// Each new game gets its own random seed; the sim itself never calls Math.random.
const newGame = (): GameState => createInitialState(undefined, undefined, Math.floor(Math.random() * 2 ** 31));

const settings = loadSettings();
const loaded = loadGame();
let state: GameState = loaded?.ok ? loaded.state : newGame();
const clock = createClock();

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
scene.add(
  floor.group,
  walls.group,
  lots.group,
  heat.mesh,
  selection.mesh,
  hover.mesh,
  buildings.group,
);

// UI state: lives here, not in the sim.
let tool: Tool = 'rack_basic';
let hoveredTile: Tile | null = null;
// Floor point under the cursor in grid units, for wall edges.
let hoverGrid: { gx: number; gy: number } | null = null;
// Corner a wall drag started from, and the corner it's at now.
let wallDrag: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;

// How close (in tiles) the cursor must be to a grid line to pick that edge.
const EDGE_PICK = 0.3;
const SELL_PICK = 0.2;

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

// Which planned edges can actually be built, given cash for the whole run.
function checkWallEdges(edges: Edge[]): { edge: Edge; ok: boolean }[] {
  if (!isWallTool(tool)) return [];
  const cost = CONFIG.walls[tool].cost;
  let cash = state.cash;
  return edges.map((edge) => {
    // The wall between rooms is already there: only doors or glass can replace it.
    const boundaryClash = tool === 'wall_basic' && isRoomBoundaryEdge(state, edge.x, edge.y, edge.dir);
    const free = isInteriorEdge(state, edge.x, edge.y, edge.dir) && !wallAt(state, edge.x, edge.y, edge.dir) && !boundaryClash;
    const ok = free && isUnlocked(state, tool) && cash >= cost;
    if (ok) cash -= cost;
    return { edge, ok };
  });
}

// A wall right under the cursor, for the Sell tool.
function wallUnderCursor(): Edge | null {
  if (!hoverGrid) return null;
  const near = nearestEdge(hoverGrid.gx, hoverGrid.gy);
  if (near.distance > SELL_PICK) return null;
  return wallAt(state, near.edge.x, near.edge.y, near.edge.dir) ? near.edge : null;
}
// Locked tools and the locked heat map can't be selected.
const selectTool = (t: Tool): void => {
  if (t === 'sell' || isUnlocked(state, t)) tool = t;
};
const toggleHeat = (): void => {
  if (isUnlocked(state, 'heat_map')) heat.visible = !heat.visible;
};

const toasts = new Toasts(document.body);
const announcer = new Announcer(toasts, state);
const goals = new GoalsPanel(document.body);
const contracts = new ContractsPanel(document.body, {
  onSign: (id) => signContract(state, id),
  onCancel: (id) => cancelContract(state, id),
});
const toggleContracts = (): void => {
  if (isUnlocked(state, 'contract_board')) contracts.toggle();
};
// The panel works with building ids; commands take tile coordinates.
const withBuilding = (id: number, run: (x: number, y: number) => void): void => {
  const b = state.buildings.find((x) => x.id === id);
  if (b) run(b.x, b.y);
};
const buildingPanel = new BuildingPanel(document.body, {
  onUpgrade: (id) => withBuilding(id, (x, y) => upgradeBuilding(state, x, y)),
  onUpgradePart: (id, slot) => withBuilding(id, (x, y) => upgradePart(state, x, y, slot)),
  onSell: (id) => withBuilding(id, (x, y) => sellBuilding(state, x, y)),
  onRepair: (id) => withBuilding(id, (x, y) => repairRack(state, x, y)),
});
const stylePanel = new StylePanel(document.body, { onChoose: (id) => buyStyle(state, id) });
const toggleStyle = (): void => {
  if (isUnlocked(state, 'room_styles')) stylePanel.toggle();
};
const roomSale = new RoomSale(document.body, { onBuy: (id) => buyLot(state, id) });

const startNewGame = (): void => {
  state = newGame();
  clock.accumulator = 0;
  buildings.clear();
  floor.clear();
  walls.clear();
  tool = 'rack_basic';
  heat.visible = false;
  contracts.toggle(false);
  stylePanel.toggle(false);
  buildingPanel.close();
  roomSale.close();
  rig.focus(startCentre.x, startCentre.z);
  announcer.reset(state);
  persist();
};

// Set while reloading after an import, so the page-hide autosave can't
// overwrite the imported save with the old game.
let saveBlocked = false;
let pendingImport: GameState | null = null;

const menu = new Menu(document.body, settings.autosave, {
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
  onNewGame: startNewGame,
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
  onRestart: startNewGame,
});
const toolbar = new Toolbar(document.body, {
  onSelectTool: selectTool,
  onToggleHeat: toggleHeat,
  onToggleContracts: toggleContracts,
  onToggleStyle: toggleStyle,
  onToggleWallHeight: () => toggleWallHeight(),
});

const toggleWallHeight = (): void => {
  if (isUnlocked(state, 'wall_basic')) walls.tall = !walls.tall;
};
const closePanels = (): void => {
  toolbar.close();
  buildingPanel.close();
  contracts.toggle(false);
  stylePanel.toggle(false);
  roomSale.close();
};

const updateInput = attachInput(renderer.domElement, rig, {
  onHover: (cx, cy) => {
    hoveredTile = picker.pick(cx, cy);
    hoverGrid = picker.pickGrid(cx, cy);
  },
  onHoverEnd: () => {
    hoveredTile = null;
    hoverGrid = null;
  },
  isDrawMode: () => isWallTool(tool) && isUnlocked(state, tool),
  onDrawStart: (cx, cy) => {
    const grid = picker.pickGrid(cx, cy);
    if (!grid) return;
    const corner = nearestCorner(grid.gx, grid.gy);
    wallDrag = { start: corner, end: corner };
  },
  onDrawMove: (cx, cy) => {
    const grid = picker.pickGrid(cx, cy);
    if (wallDrag && grid) wallDrag.end = nearestCorner(grid.gx, grid.gy);
  },
  onDrawEnd: (_cx, _cy, cancelled) => {
    if (!cancelled && isWallTool(tool)) {
      for (const { edge, ok } of checkWallEdges(plannedWallEdges())) {
        if (ok) placeWall(state, tool, edge.x, edge.y, edge.dir);
      }
    }
    wallDrag = null;
  },
  onToggleWallHeight: toggleWallHeight,
  onEscape: closePanels,
  onClick: (cx, cy) => {
    if (tool === 'sell') {
      const wall = wallUnderCursor();
      if (wall) {
        removeWall(state, wall.x, wall.y, wall.dir);
        return;
      }
    }
    const tile = picker.pick(cx, cy);
    if (!tile) return;
    // Clicking a room for sale offers to buy it.
    if (!isOwnedTile(state, tile.x, tile.y)) {
      const lot = lotAt(state, tile.x, tile.y);
      if (lot && purchasableLots(state).some((l) => l.id === lot.id)) roomSale.ask(lot.id);
      return;
    }
    const action = applyTool(state, tool, tile.x, tile.y);
    const clicked = state.buildings.find((b) => b.x === tile.x && b.y === tile.y);
    if (action === 'inspect' && clicked) buildingPanel.show(clicked.id);
    else if (action !== 'repair') buildingPanel.close();
  },
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

  let preview: ToolPreview | null = hoveredTile ? previewTool(state, tool, hoveredTile.x, hoveredTile.y) : null;

  // Walls work on edges, so they get their own preview: a ghost wall and a
  // cost summary instead of a tile highlight.
  let ghosts: { edge: Edge; ok: boolean }[] = [];
  const sellWall = tool === 'sell' ? wallUnderCursor() : null;
  if (sellWall) {
    const kind = wallAt(state, sellWall.x, sellWall.y, sellWall.dir)!.kind;
    const refund = CONFIG.walls[kind].cost * CONFIG.economy.sellRefund;
    preview = { action: 'draw', text: `Remove ${CONFIG.walls[kind].name}: +£${refund}` };
    ghosts = [{ edge: sellWall, ok: false }];
  } else if (isWallTool(tool) && isUnlocked(state, tool)) {
    ghosts = checkWallEdges(plannedWallEdges());
    const buildable = ghosts.filter((g) => g.ok).length;
    if (wallDrag && ghosts.length > 0) {
      const def = CONFIG.walls[tool];
      preview = { action: 'draw', text: `${buildable} × ${def.name}: £${(buildable * def.cost).toLocaleString('en-GB')}` };
    }
  }
  walls.showGhost(ghosts, state);

  buildings.sync(state, dt);
  floor.sync(state);
  walls.sync(state);
  lots.update(state);
  room.update(state);
  room.follow(rig.target);
  roomSale.update(state, rig.camera, renderer.domElement);
  heat.update(state);
  hover.set(preview && preview.action !== 'draw' ? hoveredTile : null, preview?.action ?? 'place');
  hud.update(state, hoveredTile, preview);
  toolbar.update(state, tool, {
    heat: heat.visible,
    contracts: contracts.open,
    style: stylePanel.open,
    tallWalls: walls.tall,
  });
  goals.update(state);
  contracts.update(state);
  stylePanel.update(state);
  const selected = buildingPanel.update(state);
  selection.set(selected ? { x: selected.x, y: selected.y } : null, 'inspect');
  announcer.update(state);
  menu.update();
  renderer.render(scene, rig.camera);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
