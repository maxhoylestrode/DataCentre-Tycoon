import * as THREE from 'three';
import { type BuildingCategory, CONFIG } from '../config';
import { rackFill } from '../sim/economy';
import { powerEfficiency } from '../sim/power';
import { type Building, categoryOf, type GameState, tempAt } from '../sim/state';
import { tileToWorld } from './grid';

const { width: RW, depth: RD, height: RH } = CONFIG.rack;
const LED_COUNT = 6;

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

const rackBodyMat = mat(0x2b3038, { metalness: 0.3 });
const rackPanelMat = mat(0x3c434e, { roughness: 0.5 });
const rackPanelHotMat = mat(0x5a3a24, { emissive: 0xff6a00, emissiveIntensity: 0.6 });
const ledOnMat = new THREE.MeshBasicMaterial({ color: 0x5dff9a });
const ledOffMat = new THREE.MeshBasicMaterial({ color: 0x1d2a22 });
const ledFailMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
const ledRepairMat = new THREE.MeshBasicMaterial({ color: 0x4f9cf0 });

const powerBodyMat = mat(0xc9a227, { metalness: 0.2 });
const darkMat = mat(0x22262c);
const capMat = mat(0x8c939c, { metalness: 0.6, roughness: 0.3 });

const coolBodyMat = mat(0xdfe6ee);
const fanMat = mat(0x3a4048);

const box = (w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

interface BuildingView {
  group: THREE.Group;
  update(state: GameState, building: Building, dt: number): void;
}

// Dark cabinet facing +z (towards the camera). LEDs light bottom-up as the
// rack fills, all red when failed, all blue while repairing. The front panel
// glows orange when the tile is above the warning temperature.
function createRackView(): BuildingView {
  const group = new THREE.Group();
  const body = box(RW, RH, RD, rackBodyMat);
  body.position.y = RH / 2;
  group.add(body);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(RW * 0.86, RH * 0.9, 0.02), rackPanelMat);
  panel.position.set(0, RH / 2, RD / 2 + 0.01);
  group.add(panel);

  const ledGeo = new THREE.BoxGeometry(0.06, 0.03, 0.02);
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < LED_COUNT; i++) {
    const led = new THREE.Mesh(ledGeo, ledOffMat);
    led.position.set(RW * 0.3, RH * 0.2 + i * RH * 0.12, RD / 2 + 0.025);
    group.add(led);
    leds.push(led);
  }

  return {
    group,
    update(state, rack) {
      let lit = 0;
      let on: THREE.Material = ledOnMat;
      if (rack.status === 'failed') [lit, on] = [LED_COUNT, ledFailMat];
      else if (rack.status === 'repairing') [lit, on] = [LED_COUNT, ledRepairMat];
      // At least one LED is always lit so a brand-new rack reads as powered.
      else lit = Math.max(1, Math.ceil(rackFill(state, rack) * LED_COUNT));
      leds.forEach((led, i) => (led.material = i < lit ? on : ledOffMat));

      const hot = rack.status === 'ok' && tempAt(state, rack.x, rack.y) > CONFIG.heat.warnTemp;
      panel.material = hot ? rackPanelHotMat : rackPanelMat;
    },
  };
}

// Squat yellow cabinet with a dark top plate and two capacitor cylinders.
function createPowerView(): BuildingView {
  const group = new THREE.Group();
  const body = box(0.85, 0.7, 0.85, powerBodyMat);
  body.position.y = 0.35;
  group.add(body);

  const plate = box(0.7, 0.04, 0.7, darkMat);
  plate.position.y = 0.72;
  group.add(plate);

  const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12);
  for (const x of [-0.18, 0.18]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, 0.89, 0);
    cap.castShadow = true;
    group.add(cap);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.02), darkMat);
  stripe.position.set(0, 0.45, 0.43);
  group.add(stripe);

  return { group, update() {} };
}

// White unit with a spinning fan on top. The fan slows in a brownout.
function createCoolingView(): BuildingView {
  const group = new THREE.Group();
  const body = box(0.85, 0.9, 0.85, coolBodyMat);
  body.position.y = 0.45;
  group.add(body);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), fanMat);
  ring.position.y = 0.92;
  group.add(ring);

  const fan = new THREE.Group();
  fan.position.y = 0.96;
  const bladeGeo = new THREE.BoxGeometry(0.58, 0.02, 0.1);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, coolBodyMat);
    blade.rotation.y = (i * Math.PI) / 3;
    fan.add(blade);
  }
  group.add(fan);

  return {
    group,
    update(state, _building, dt) {
      if (!state.paused && !state.bankrupt) fan.rotation.y += dt * 8 * state.speed * powerEfficiency(state);
    },
  };
}

// One model per category, so new building ids reuse an existing look.
const FACTORIES: Record<BuildingCategory, () => BuildingView> = {
  rack: createRackView,
  power: createPowerView,
  cooling: createCoolingView,
};

// Keeps one view per building in GameState. Reads state, never writes it.
export class BuildingLayer {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, BuildingView>();

  sync(state: GameState, dt: number): void {
    const alive = new Set<number>();
    for (const building of state.buildings) {
      alive.add(building.id);
      let view = this.views.get(building.id);
      if (!view) {
        view = FACTORIES[categoryOf(building)]();
        view.group.position.copy(tileToWorld(state.width, state.height, building.x, building.y));
        this.views.set(building.id, view);
        this.group.add(view.group);
      }
      view.update(state, building, dt);
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      this.group.remove(view.group);
      this.views.delete(id);
    }
  }

  // Used on restart, where building ids start again from 1.
  clear(): void {
    for (const view of this.views.values()) this.group.remove(view.group);
    this.views.clear();
  }
}
