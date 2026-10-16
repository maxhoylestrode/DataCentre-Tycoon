import { CONFIG } from './config';
import { advanceClock, createClock } from './sim/clock';
import { setSpeed, togglePause } from './sim/commands';
import { createInitialState, type GameState } from './sim/state';
import { CameraRig } from './render/camera';
import { createGridLines, HoverHighlight, type Tile, TilePicker } from './render/grid';
import { HeatOverlay } from './render/heatmap';
import { BuildingLayer } from './render/models';
import { createScene } from './render/scene';
import { attachInput } from './input/input';
import { applyTool, previewTool, type Tool } from './input/tools';
import { exportSaveFile, loadGame, loadSettings, readSaveFile, saveGame, saveSettings } from './io/storage';
import { isUnlocked } from './sim/progression';
import { Announcer } from './ui/announcer';
import { GoalsPanel } from './ui/goals';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Toasts } from './ui/toasts';
import { Toolbar } from './ui/toolbar';

const settings = loadSettings();
const loaded = loadGame();
let state: GameState = loaded?.ok ? loaded.state : createInitialState();
const clock = createClock();

const container = document.getElementById('app') as HTMLElement;
const { renderer, scene } = createScene(container, state.width, state.height);
const rig = new CameraRig(container.clientWidth / container.clientHeight, state.width, state.height);
const picker = new TilePicker(rig.camera, renderer.domElement, state.width, state.height);

const hover = new HoverHighlight(state.width, state.height);
const heat = new HeatOverlay(state.width, state.height);
const buildings = new BuildingLayer();
scene.add(createGridLines(state.width, state.height), heat.mesh, hover.mesh, buildings.group);

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

const startNewGame = (): void => {
  state = createInitialState();
  clock.accumulator = 0;
  buildings.clear();
  tool = 'rack_basic';
  heat.visible = false;
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
const toolbar = new Toolbar(document.body, { onSelectTool: selectTool, onToggleHeat: toggleHeat });

const updateInput = attachInput(renderer.domElement, rig, {
  onHover: (cx, cy) => (hoveredTile = picker.pick(cx, cy)),
  onHoverEnd: () => (hoveredTile = null),
  onClick: (cx, cy) => {
    const tile = picker.pick(cx, cy);
    if (tile) applyTool(state, tool, tile.x, tile.y);
  },
  onTogglePause: () => togglePause(state),
  onSetSpeed: (speed) => setSpeed(state, speed),
  onSelectTool: selectTool,
  onToggleHeat: toggleHeat,
});

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
  heat.update(state);
  hover.set(preview ? hoveredTile : null, preview?.action ?? 'place');
  hud.update(state, hoveredTile, preview);
  toolbar.update(state, tool, heat.visible);
  goals.update(state);
  announcer.update(state);
  menu.update();
  renderer.render(scene, rig.camera);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
