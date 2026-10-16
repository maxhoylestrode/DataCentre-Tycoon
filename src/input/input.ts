import { CONFIG, type Speed } from '../config';
import type { CameraRig } from '../render/camera';
import { type Tool, TOOL_HOTKEYS } from './tools';

// Movement (px) before a press counts as a drag instead of a click.
const DRAG_THRESHOLD = 5;

export interface InputHandlers {
  onHover(clientX: number, clientY: number): void;
  onHoverEnd(): void;
  onClick(clientX: number, clientY: number): void;
  onTogglePause(): void;
  onSetSpeed(speed: Speed): void;
  onSelectTool(tool: Tool): void;
  onToggleHeat(): void;
}

const SPEED_KEYS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 4 };
const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(
  Object.entries(TOOL_HOTKEYS).map(([tool, key]) => [`Key${key}`, tool as Tool]),
);

// Left click: use the selected tool on a tile. Drag with any button: pan.
// Wheel: zoom. WASD / arrow keys: pan. Space: pause. 1/2/3: speed.
// R/P/C/X: select tool. H: heat map.
// Returns an update function to call every frame.
export function attachInput(canvas: HTMLCanvasElement, rig: CameraRig, handlers: InputHandlers): (dt: number) => void {
  let press: { id: number; button: number; startX: number; startY: number; lastX: number; lastY: number; dragging: boolean } | null = null;
  const keys = new Set<string>();

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (press) return;
    canvas.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, button: e.button, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, dragging: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) {
      handlers.onHover(e.clientX, e.clientY);
      return;
    }
    if (!press.dragging && Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > DRAG_THRESHOLD) {
      press.dragging = true;
    }
    if (press.dragging) {
      rig.panByPixels(e.clientX - press.lastX, e.clientY - press.lastY, canvas.clientHeight);
    }
    press.lastX = e.clientX;
    press.lastY = e.clientY;
    handlers.onHover(e.clientX, e.clientY);
  });

  const endPress = (e: PointerEvent, cancelled: boolean): void => {
    if (!press || press.id !== e.pointerId) return;
    if (!cancelled && !press.dragging && press.button === 0) handlers.onClick(e.clientX, e.clientY);
    press = null;
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));
  canvas.addEventListener('pointerleave', () => {
    if (!press) handlers.onHoverEnd();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      rig.zoomBy(e.deltaY < 0 ? CONFIG.camera.zoomStep : 1 / CONFIG.camera.zoomStep);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      handlers.onTogglePause();
    }
    const speed = SPEED_KEYS[e.code];
    if (speed) handlers.onSetSpeed(speed);
    const tool = TOOL_KEYS[e.code];
    if (tool) handlers.onSelectTool(tool);
    if (e.code === 'KeyH') handlers.onToggleHeat();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  return (dt: number) => {
    let right = 0;
    let forward = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;
    if (right === 0 && forward === 0) return;
    const step = (CONFIG.camera.keyPanSpeed / rig.camera.zoom) * dt;
    rig.pan(right * step, forward * step);
  };
}
