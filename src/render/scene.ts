import * as THREE from 'three';

const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.2;
const KERB_HEIGHT = 0.15;

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
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

  addLights(scene, gridWidth, gridHeight);
  addRoom(scene, gridWidth, gridHeight);

  return { renderer, scene };
}

function addLights(scene: THREE.Scene, w: number, h: number): void {
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x30343a, 1.2));

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = Math.max(w, h);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 60 });
  scene.add(sun);
}

// Floor top sits at y = 0 so picking can intersect the y = 0 plane.
function addRoom(scene: THREE.Scene, w: number, h: number): void {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.2, h),
    new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.9 }),
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d7682, roughness: 0.8 });
  const wall = (sx: number, sy: number, sz: number, x: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
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
}
