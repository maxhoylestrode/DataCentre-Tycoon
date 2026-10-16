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
  onToggleContracts(): void;
  onToggleStyle(): void;
  onToggleWallHeight(): void;
  onEscape(): void;
  // Draw mode (wall tools): left-drag draws instead of panning.
  isDrawMode(): boolean;
  onDrawStart(clientX: number, clientY: number): void;
  onDrawMove(clientX: number, clientY: number): void;
  onDrawEnd(clientX: number, clientY: number, cancelled: boolean): void;
}

const SPEED_KEYS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 3 };
const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(
  Object.entries(TOOL_HOTKEYS).map(([tool, key]) => [`Key${key}`, tool as Tool]),
);

// Left click: use the selected tool on a tile. Drag with any button: pan,
// except left-drag with a wall tool, which draws walls.
// Wheel: zoom. WASD / arrow keys: pan. Space: pause. 1/2/3: speed.
// R/P/C/B/X: select tool. H: heat map. K: contracts. L: room style.
// V: walls up/down. Esc: cancel / close panels.
// Returns an update function to call every frame.
export function attachInput(canvas: HTMLCanvasElement, rig: CameraRig, handlers: InputHandlers): (dt: number) => void {
  let press: {
    id: number;
    button: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
    drawing: boolean;
  } | null = null;
  const keys = new Set<string>();
  // Touch: every finger on the canvas, and the pinch in progress (two fingers
  // zoom by their spread and pan by their midpoint).
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; midX: number; midY: number } | null = null;

  const pinchGeometry = (): { dist: number; midX: number; midY: number } => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), midX: (a!.x + b!.x) / 2, midY: (a!.y + b!.y) / 2 };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // A second finger turns the gesture into a pinch: cancel the tap or draw.
      if (press?.drawing) handlers.onDrawEnd(0, 0, true);
      press = null;
      pinch = pinchGeometry();
      return;
    }
    if (press || pinch) return;
    canvas.setPointerCapture(e.pointerId);
    const drawing = e.button === 0 && handlers.isDrawMode();
    press = {
      id: e.pointerId, button: e.button, startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY, dragging: false, drawing,
    };
    if (drawing) handlers.onDrawStart(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (pointers.size < 2) return;
      const now = pinchGeometry();
      if (pinch.dist > 0 && now.dist > 0) rig.zoomBy(now.dist / pinch.dist);
      rig.panByPixels(now.midX - pinch.midX, now.midY - pinch.midY, canvas.clientHeight);
      pinch = now;
      return;
    }
    if (!press || press.id !== e.pointerId) {
      handlers.onHover(e.clientX, e.clientY);
      return;
    }
    if (press.drawing) {
      handlers.onDrawMove(e.clientX, e.clientY);
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
    pointers.delete(e.pointerId);
    // After a pinch, wait for every finger to lift before taps count again.
    if (pinch) {
      if (pointers.size === 0) pinch = null;
      return;
    }
    if (!press || press.id !== e.pointerId) return;
    if (press.drawing) handlers.onDrawEnd(e.clientX, e.clientY, cancelled);
    else if (!cancelled && !press.dragging && press.button === 0) handlers.onClick(e.clientX, e.clientY);
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
    if (e.code === 'KeyK') handlers.onToggleContracts();
    if (e.code === 'KeyL') handlers.onToggleStyle();
    if (e.code === 'KeyV') handlers.onToggleWallHeight();
    if (e.code === 'Escape') {
      // Cancels a wall being drawn; otherwise closes panels.
      if (press?.drawing) {
        press = null;
        handlers.onDrawEnd(0, 0, true);
      } else {
        handlers.onEscape();
      }
    }
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
