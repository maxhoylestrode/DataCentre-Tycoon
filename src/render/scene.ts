import * as THREE from 'three';
import { CONFIG } from '../config';
import { LOTS } from '../sim/content/lots';
import { ROOM_STYLES } from '../sim/content/styles';
import { lotSize } from '../sim/lots';
import type { GameState, StyleState } from '../sim/state';

const WALL_HEIGHT = CONFIG.wallHeights.full;
const WALL_THICKNESS = 0.2;
const KERB_HEIGHT = 0.15;
// The sun's shadow covers this far around the camera target (it follows the
// camera so shadows stay sharp on a big map).
const SHADOW_EXTENT = 30;

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  room: RoomLook;
}

export function createScene(container: HTMLElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);

  const room = new RoomLook(scene);
  return { renderer, scene, room };
}

// The owned rooms' floors and outer walls, restyled from the player's room
// style. Rebuilt whenever a room is bought. Walls between two owned rooms
// are drawn by the wall layer, so doorways can replace parts of them.
export class RoomLook {
  private readonly floorMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.9 });
  private readonly wallMat = new THREE.MeshStandardMaterial({ color: 0x6d7682, roughness: 0.8 });
  private readonly hemi = new THREE.HemisphereLight(0xdfe8f5, 0x30343a, 1.2);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly sunOffset = new THREE.Vector3(8, 20, 12);
  // Coloured glow along the top of the far walls for accent lighting styles.
  private readonly accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly geometry = new THREE.Group();
  private readonly accents: THREE.Mesh[] = [];
  private accentOn = false;
  private styleKey = '';
  private lotsKey = '';
  // The lighting style's own intensity; the time of day scales it.
  private baseIntensity = 1;
  private readonly sunColour = new THREE.Color(0xffffff);
  private readonly background = new THREE.Color(0x14171c);
  private scene: THREE.Scene | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 80,
    });
    scene.add(this.sun, this.sun.target, this.geometry);
    this.scene = scene;
  }

  // Keeps the shadow-casting light centred on what the camera is looking at.
  follow(target: THREE.Vector3): void {
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
  }

  // Lighting for the time of day (hour 0–24), or null for constant daylight.
  // It stays bright enough to play at night: the room lights are on.
  setTimeOfDay(hour: number | null): void {
    const day = hour === null ? 1 : Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
    // Sun from the east in the morning, overhead at noon, west in the evening.
    const angle = hour === null ? 0.6 : ((hour - 12) / 12) * 1.2;
    this.sunOffset.set(14 * Math.sin(angle) + 4, 12 + 10 * day, 12);
    const dusk = hour === null ? 0 : Math.max(0, 1 - Math.abs(day - 0.25) * 6) * (day > 0 ? 1 : 0);
    // Cool blue at night, warm at dawn and dusk, white by day.
    this.sunColour.setRGB(0.55 + 0.45 * day + 0.25 * dusk, 0.62 + 0.38 * day, 0.85 + 0.15 * day - 0.25 * dusk);
    this.sun.color.copy(this.sunColour);
    this.sun.intensity = 1.6 * this.baseIntensity * (0.45 + 0.55 * day);
    this.hemi.intensity = 1.2 * this.baseIntensity * (0.75 + 0.25 * day);
    this.background.setRGB(0.05 + 0.03 * day, 0.06 + 0.035 * day, 0.08 + 0.035 * day);
    if (this.scene) (this.scene.background as THREE.Color).copy(this.background);
  }

  update(state: GameState): void {
    const lotsKey = state.ownedLots.join(',');
    if (lotsKey !== this.lotsKey) {
      this.lotsKey = lotsKey;
      this.rebuild(state);
    }
    this.applyStyle(state.style);
  }

  // Floor top sits at y = 0 so picking can intersect the y = 0 plane.
  private rebuild(state: GameState): void {
    this.geometry.clear();
    this.accents.length = 0;
    const { w: lw, h: lh } = lotSize(state);
    const owned = LOTS.filter((l) => state.ownedLots.includes(l.id) && (l.col + 1) * lw <= state.width && (l.row + 1) * lh <= state.height);
    const isOwned = (col: number, row: number): boolean => owned.some((l) => l.col === col && l.row === row);
    const t = WALL_THICKNESS;

    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.geometry.add(mesh);
      return mesh;
    };
    const accent = (sx: number, sz: number, x: number, z: number): void => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), this.accentMat);
      strip.position.set(x, WALL_HEIGHT - 0.15, z);
      strip.visible = this.accentOn;
      this.geometry.add(strip);
      this.accents.push(strip);
    };

    for (const lot of owned) {
      // World position of the lot's corner (the map is centred on the origin).
      const x0 = lot.col * lw - state.width / 2;
      const z0 = lot.row * lh - state.height / 2;
      const cx = x0 + lw / 2;
      const cz = z0 + lh / 2;
      box(lw, 0.2, lh, cx, -0.1, cz, this.floorMat).castShadow = false;

      // Full-height walls on the far sides (back and left), low kerbs on the
      // near sides so they never hide the floor. Sides shared with another
      // owned room are left to the wall layer.
      if (!isOwned(lot.col, lot.row - 1)) {
        box(lw + 2 * t, WALL_HEIGHT, t, cx, WALL_HEIGHT / 2, z0 - t / 2, this.wallMat);
        accent(lw, 0.02, cx, z0 + 0.01);
      }
      if (!isOwned(lot.col - 1, lot.row)) {
        box(t, WALL_HEIGHT, lh + 2 * t, x0 - t / 2, WALL_HEIGHT / 2, cz, this.wallMat);
        accent(0.02, lh, x0 + 0.01, cz);
      }
      if (!isOwned(lot.col, lot.row + 1)) box(lw + 2 * t, KERB_HEIGHT, t, cx, KERB_HEIGHT / 2, z0 + lh + t / 2, this.wallMat);
      if (!isOwned(lot.col + 1, lot.row)) box(t, KERB_HEIGHT, lh + 2 * t, x0 + lw + t / 2, KERB_HEIGHT / 2, cz, this.wallMat);
    }
  }

  private applyStyle(style: StyleState): void {
    const key = `${style.floor}|${style.wall}|${style.lighting}|${this.lotsKey}`;
    if (key === this.styleKey) return;
    this.styleKey = key;

    const find = (id: string) => ROOM_STYLES.find((s) => s.id === id);
    const floor = find(style.floor);
    const wall = find(style.wall);
    const light = find(style.lighting);
    if (floor) this.floorMat.color.setHex(floor.color);
    if (wall) this.wallMat.color.setHex(wall.color);
    if (light) {
      const intensity = light.intensity ?? 1;
      this.hemi.color.setHex(light.color);
      this.baseIntensity = intensity;
      this.hemi.intensity = 1.2 * intensity;
      this.sun.intensity = 1.6 * intensity;
      this.accentOn = light.accent !== undefined;
      for (const strip of this.accents) strip.visible = this.accentOn;
      if (light.accent !== undefined) this.accentMat.color.setHex(light.accent);
    }
  }
}
