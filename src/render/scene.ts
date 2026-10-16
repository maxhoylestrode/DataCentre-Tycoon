import * as THREE from 'three';
import { ROOM_STYLES } from '../sim/content/styles';
import type { StyleState } from '../sim/state';

const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.2;
const KERB_HEIGHT = 0.15;

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  room: RoomLook;
}

export function createScene(container: HTMLElement, gridWidth: number, gridHeight: number): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);

  const room = new RoomLook(scene, gridWidth, gridHeight);
  return { renderer, scene, room };
}

// The room's floor, walls and lights, restyled from the player's room style.
export class RoomLook {
  private readonly floorMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.9 });
  private readonly wallMat = new THREE.MeshStandardMaterial({ color: 0x6d7682, roughness: 0.8 });
  private readonly hemi = new THREE.HemisphereLight(0xdfe8f5, 0x30343a, 1.2);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  // Coloured glow along the top of the back walls for accent lighting styles.
  private readonly accents: THREE.Mesh[] = [];
  private readonly accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private lastKey = '';

  constructor(scene: THREE.Scene, private readonly w: number, private readonly h: number) {
    scene.add(this.hemi);
    this.sun.position.set(8, 20, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const extent = Math.max(w, h);
    Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 60 });
    scene.add(this.sun);
    this.buildRoom(scene);
  }

  // Floor top sits at y = 0 so picking can intersect the y = 0 plane.
  private buildRoom(scene: THREE.Scene): void {
    const { w, h } = this;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, h), this.floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    scene.add(floor);

    const wall = (sx: number, sy: number, sz: number, x: number, z: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.wallMat);
      mesh.position.set(x, sy / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    };

    const t = WALL_THICKNESS;
    // Full-height walls on the two far sides, low kerbs on the near sides so
    // they never hide the floor from the camera.
    wall(w + 2 * t, WALL_HEIGHT, t, 0, -h / 2 - t / 2);
    wall(t, WALL_HEIGHT, h, -w / 2 - t / 2, 0);
    wall(w + 2 * t, KERB_HEIGHT, t, 0, h / 2 + t / 2);
    wall(t, KERB_HEIGHT, h, w / 2 + t / 2, 0);

    const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.02), this.accentMat);
    back.position.set(0, WALL_HEIGHT - 0.15, -h / 2 + 0.01);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, h), this.accentMat);
    left.position.set(-w / 2 + 0.01, WALL_HEIGHT - 0.15, 0);
    for (const strip of [back, left]) {
      strip.visible = false;
      scene.add(strip);
      this.accents.push(strip);
    }
  }

  apply(style: StyleState): void {
    const key = `${style.floor}|${style.wall}|${style.lighting}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const find = (id: string) => ROOM_STYLES.find((s) => s.id === id);
    const floor = find(style.floor);
    const wall = find(style.wall);
    const light = find(style.lighting);
    if (floor) this.floorMat.color.setHex(floor.color);
    if (wall) this.wallMat.color.setHex(wall.color);
    if (light) {
      const intensity = light.intensity ?? 1;
      this.hemi.color.setHex(light.color);
      this.hemi.intensity = 1.2 * intensity;
      this.sun.intensity = 1.6 * intensity;
      for (const strip of this.accents) strip.visible = light.accent !== undefined;
      if (light.accent !== undefined) this.accentMat.color.setHex(light.accent);
    }
  }
}
