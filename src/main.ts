import { CONFIG } from './config';
import { advanceClock, createClock } from './sim/clock';
import {
  buyStyle,
  cancelContract,
  repairRack,
  sellBuilding,
  setSpeed,
  signContract,
  togglePause,
  upgradeBuilding,
  upgradePart,
} from './sim/commands';
import { createInitialState, type GameState } from './sim/state';
import { CameraRig } from './render/camera';
import { createGridLines, HoverHighlight, type Tile, TilePicker } from './render/grid';
import { HeatOverlay } from './render/heatmap';
import { BuildingLayer, FloorLayer } from './render/models';
import { createScene } from './render/scene';
import { attachInput } from './input/input';
import { applyTool, previewTool, type Tool } from './input/tools';
import { exportSaveFile, loadGame, loadSettings, readSaveFile, saveGame, saveSettings } from './io/storage';
import { isUnlocked, totalXpForLevel } from './sim/progression';
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
const { renderer, scene, room } = createScene(container, state.width, state.height);
const rig = new CameraRig(container.clientWidth / container.clientHeight, state.width, state.height);
const picker = new TilePicker(rig.camera, renderer.domElement, state.width, state.height);

const hover = new HoverHighlight(state.width, state.height);
// Marks the building whose panel is open.
const selection = new HoverHighlight(state.width, state.height);
const heat = new HeatOverlay(state.width, state.height);
const buildings = new BuildingLayer();
const floor = new FloorLayer();
scene.add(
  floor.group,
  createGridLines(state.width, state.height),
  heat.mesh,
  selection.mesh,
  hover.mesh,
  buildings.group,
);

// UI state: lives here, not in the sim.
let tool: Tool = 'rack_basic';
let hoveredTile: Tile | null = null;
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

const startNewGame = (): void => {
  state = newGame();
  clock.accumulator = 0;
  buildings.clear();
  floor.clear();
  tool = 'rack_basic';
  heat.visible = false;
  contracts.toggle(false);
  stylePanel.toggle(false);
  buildingPanel.close();
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
});

const updateInput = attachInput(renderer.domElement, rig, {
  onHover: (cx, cy) => (hoveredTile = picker.pick(cx, cy)),
  onHoverEnd: () => (hoveredTile = null),
  onClick: (cx, cy) => {
    const tile = picker.pick(cx, cy);
    if (!tile) return;
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

  const preview = hoveredTile ? previewTool(state, tool, hoveredTile.x, hoveredTile.y) : null;
  buildings.sync(state, dt);
  floor.sync(state);
  room.apply(state.style);
  heat.update(state);
  hover.set(preview ? hoveredTile : null, preview?.action ?? 'place');
  hud.update(state, hoveredTile, preview);
  toolbar.update(state, tool, { heat: heat.visible, contracts: contracts.open, style: stylePanel.open });
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
