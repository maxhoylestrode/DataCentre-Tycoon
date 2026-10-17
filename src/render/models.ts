import * as THREE from 'three';
import { type BuildingKind, CONFIG } from '../config';
import { buildTicks, partTierTotal } from '../sim/buildings';
import { rackFill } from '../sim/economy';
import { feedVents } from '../sim/floor';
import { powerEfficiency, powerMultiblocks } from '../sim/power';
import { type Building, type GameState, tempAt } from '../sim/state';
import { tileToWorld } from './grid';

const { width: RW, depth: RD } = CONFIG.rack;
const LED_COUNT = 6;

// Materials are shared by colour so hundreds of buildings don't each make their own.
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => {
  const key = `${color}:${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    matCache.set(key, m);
  }
  return m;
};
const glow = (color: number, intensity = 0.8): THREE.MeshStandardMaterial =>
  mat(color, { emissive: color, emissiveIntensity: intensity });

const rackPanelHotMat = mat(0x5a3a24, { emissive: 0xff6a00, emissiveIntensity: 0.6 });
const ledOffMat = new THREE.MeshBasicMaterial({ color: 0x1d2a22 });
const ledFailMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
const ledRepairMat = new THREE.MeshBasicMaterial({ color: 0x4f9cf0 });
const ledMats = new Map<number, THREE.MeshBasicMaterial>();
const ledMat = (color: number): THREE.MeshBasicMaterial => {
  let m = ledMats.get(color);
  if (!m) ledMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
};

const darkMat = mat(0x22262c);
const capMat = mat(0x8c939c, { metalness: 0.6, roughness: 0.3 });
const whiteMat = mat(0xdfe6ee);
const fanMat = mat(0x3a4048);

const box = (w: number, h: number, d: number, material: THREE.Material, y = h / 2): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const cylinder = (r: number, h: number, material: THREE.Material, y = h / 2, segments = 16): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
};

interface BuildingView {
  group: THREE.Group;
  update(state: GameState, building: Building, dt: number): void;
}

// Trim colour by upgrade level: grey, then green through blue and purple to gold.
const TRIM_MATS = [
  0x6b7280, 0x3fbf6a, 0x2bb3a3, 0x2f8fe0, 0x4a62e8, 0x7a4ff0, 0xa346e6, 0xd13fb0, 0xe8603a, 0xf0a020, 0xffd23a,
].map((color, i) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i === 0 ? 0 : 0.15 }));
const pipGeo = new THREE.BoxGeometry(0.05, 0.03, 0.05);

// A thin coloured band around the sides just below the top edge, plus one
// pip per upgrade level along the front of the top. The band stays below
// the top face so the two never share a plane (which flickers).
function addUpgradeMarks(group: THREE.Group, topY: number, width: number, depth: number): (level: number) => void {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.035, depth + 0.02), TRIM_MATS[0]!);
  trim.position.y = topY - 0.06;
  group.add(trim);

  const max = CONFIG.upgrades.maxLevel;
  const spacing = (width * 0.85) / max;
  const pips: THREE.Mesh[] = [];
  for (let i = 0; i < max; i++) {
    const pip = new THREE.Mesh(pipGeo, TRIM_MATS[0]!);
    pip.position.set(-width * 0.425 + spacing * (i + 0.5), topY + 0.015, depth / 2 - 0.05);
    group.add(pip);
    pips.push(pip);
  }

  let shown = -1;
  return (raw) => {
    const level = Math.min(raw, max);
    if (level === shown) return;
    shown = level;
    const m = TRIM_MATS[Math.min(level, TRIM_MATS.length - 1)]!;
    trim.visible = level > 0;
    trim.material = m;
    pips.forEach((pip, i) => {
      pip.visible = i < level;
      pip.material = m;
    });
  };
}

interface RackLook {
  height: number;
  body: number;
  panel: number;
  led: number;
  // Glass-door racks get a lighter, glossy front.
  glass?: boolean;
}

// Each rack model looks different: taller, lighter and brighter as they get better.
const RACK_LOOKS: Partial<Record<BuildingKind, RackLook>> = {
  rack_basic: { height: 1.6, body: 0x2b3038, panel: 0x3c434e, led: 0x5dff9a },
  rack_performance: { height: 1.75, body: 0x1f2a3a, panel: 0x2c4a6e, led: 0x4fb3ff, glass: true },
  rack_enterprise: { height: 1.9, body: 0x8a929c, panel: 0xc5ccd4, led: 0xffffff },
  rack_gpu: { height: 1.9, body: 0x161a16, panel: 0x26332a, led: 0x76ff3a, glass: true },
  rack_hyperscale: { height: 2.1, body: 0x1c1726, panel: 0x3a2a5a, led: 0xc77dff, glass: true },
};

// A cabinet facing +z (towards the camera). LEDs light bottom-up as the rack
// fills, all red when failed, all blue while repairing. The front panel glows
// orange above the warning temperature. Trim and pips count part upgrades.
function createRackView(look: RackLook): BuildingView {
  const group = new THREE.Group();
  const h = look.height;
  group.add(box(RW, h, RD, mat(look.body, { metalness: 0.3 })));

  const panelMat = look.glass
    ? mat(look.panel, { metalness: 0.5, roughness: 0.15, transparent: true, opacity: 0.85 })
    : mat(look.panel, { roughness: 0.5 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(RW * 0.86, h * 0.9, 0.02), panelMat);
  panel.position.set(0, h / 2, RD / 2 + 0.01);
  group.add(panel);

  const ledGeo = new THREE.BoxGeometry(0.06, 0.03, 0.02);
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < LED_COUNT; i++) {
    const led = new THREE.Mesh(ledGeo, ledOffMat);
    led.position.set(RW * 0.3, h * 0.2 + i * h * 0.12, RD / 2 + 0.025);
    group.add(led);
    leds.push(led);
  }
  const showUpgrade = addUpgradeMarks(group, h, RW, RD);
  const onMat = ledMat(look.led);

  return {
    group,
    update(state, rack) {
      showUpgrade(partTierTotal(rack));
      let lit = 0;
      let on: THREE.Material = onMat;
      if (rack.status === 'failed') [lit, on] = [LED_COUNT, ledFailMat];
      else if (rack.status === 'repairing') [lit, on] = [LED_COUNT, ledRepairMat];
      // At least one LED is always lit so a brand-new rack reads as powered.
      else lit = Math.max(1, Math.ceil(rackFill(state, rack) * LED_COUNT));
      leds.forEach((led, i) => (led.material = i < lit ? on : ledOffMat));

      const hot = rack.status === 'ok' && tempAt(state, rack.x, rack.y) > CONFIG.heat.warnTemp;
      panel.material = hot ? rackPanelHotMat : panelMat;
    },
  };
}

// Squat yellow cabinet with a dark top plate and two capacitor cylinders.
function createPowerView(): BuildingView {
  const group = new THREE.Group();
  group.add(box(0.85, 0.7, 0.85, mat(0xc9a227, { metalness: 0.2 })));
  group.add(box(0.7, 0.04, 0.7, darkMat, 0.72));
  for (const x of [-0.18, 0.18]) {
    const cap = cylinder(0.1, 0.3, capMat, 0.89, 12);
    cap.position.x = x;
    group.add(cap);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.02), darkMat);
  stripe.position.set(0, 0.45, 0.43);
  group.add(stripe);
  const showUpgrade = addUpgradeMarks(group, 0.7, 0.85, 0.85);
  return { group, update: (_state, building) => showUpgrade(building.upgrade) };
}

// An upgradable power source: model plus the usual upgrade trim.
function powerSource(top: number, build: (g: THREE.Group) => void): () => BuildingView {
  return () => {
    const group = new THREE.Group();
    build(group);
    const showUpgrade = addUpgradeMarks(group, top, 0.88, 0.88);
    return { group, update: (_state, building) => showUpgrade(building.upgrade) };
  };
}

const createGasGenerator = powerSource(0.75, (g) => {
  g.add(box(0.88, 0.75, 0.88, mat(0x3f7a4a, { metalness: 0.3 })));
  for (let i = 0; i < 4; i++) g.add(at(box(0.9, 0.03, 0.3, darkMat, 0.2 + i * 0.13), 0, 0.3));
  const stack = cylinder(0.07, 0.45, capMat, 0.95, 12);
  stack.position.set(0.25, 0.95, -0.25);
  g.add(stack);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 14), mat(0xd0d6dc, { metalness: 0.3 }));
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.05, 0.9, 0.1);
  g.add(tank);
});

const createSolarArray = powerSource(0.32, (g) => {
  g.add(box(0.12, 0.3, 0.12, metal));
  const panelMat = mat(0x1d3a6a, { roughness: 0.25, metalness: 0.3, emissive: 0x0a1a3a, emissiveIntensity: 0.4 });
  const frame = new THREE.Group();
  frame.position.y = 0.42;
  frame.rotation.x = -0.45;
  const panel = box(0.92, 0.04, 0.8, mat(0xc8ced6), 0);
  frame.add(panel);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = box(0.2, 0.02, 0.24, panelMat, 0.025);
      cell.position.set(-0.33 + c * 0.22, 0.025, -0.26 + r * 0.26);
      frame.add(cell);
    }
  }
  g.add(frame);
});

const createFuelCell = powerSource(1.1, (g) => {
  g.add(box(0.88, 1.1, 0.7, mat(0xe8ecf0, { roughness: 0.4 })));
  for (let i = 0; i < 5; i++) {
    const fin = box(0.03, 0.8, 0.02, mat(0x3a8fd0), 0.6);
    fin.position.set(-0.3 + i * 0.15, 0.6, 0.36);
    g.add(fin);
  }
  const light = box(0.5, 0.06, 0.02, glow(0x4fb3ff, 1.2), 1.0);
  light.position.z = 0.36;
  g.add(light);
  g.add(cylinder(0.1, 0.25, mat(0x3a8fd0, { metalness: 0.4 }), 1.22, 12));
});

const createSubstation = powerSource(0.5, (g) => {
  g.add(box(0.92, 0.5, 0.92, mat(0x6b7280)));
  const ceramic = mat(0xa0522d, { roughness: 0.4 });
  for (const x of [-0.28, 0, 0.28]) {
    const post = cylinder(0.05, 0.6, ceramic, 0.8, 10);
    post.position.x = x;
    g.add(post);
    for (let i = 0; i < 3; i++) {
      const disc = cylinder(0.09, 0.03, ceramic, 0.65 + i * 0.15, 12);
      disc.position.x = x;
      g.add(disc);
    }
  }
  g.add(box(0.8, 0.04, 0.06, metal, 1.12));
  const sign = box(0.18, 0.18, 0.01, mat(0xffd23a), 0.3);
  sign.position.z = 0.465;
  g.add(sign);
});

const createReactor = powerSource(0.35, (g) => {
  g.add(box(0.94, 0.35, 0.94, mat(0x30343a)));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xdfe6ee, { roughness: 0.3 }));
  dome.position.y = 0.35;
  dome.castShadow = true;
  g.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 8, 32), glow(0x3fe0c0, 1.4));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.37;
  g.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), glow(0x3fe0c0, 2));
  core.position.y = 0.78;
  g.add(core);
});

const createUps = staticView((g) => {
  g.add(box(0.8, 1.2, 0.6, mat(0x2b2f36)));
  for (let i = 0; i < 4; i++) {
    const cell = box(0.66, 0.2, 0.02, mat(0x3a3f48), 0.22 + i * 0.25);
    cell.position.z = 0.305;
    g.add(cell);
    const charge = box(0.36, 0.05, 0.01, glow(0x5dff9a, 1.1), 0.22 + i * 0.25);
    charge.position.set(-0.12, 0.22 + i * 0.25, 0.32);
    g.add(charge);
  }
  const bolt = box(0.08, 0.08, 0.01, glow(0xffd23a, 1.2), 1.12);
  bolt.position.z = 0.31;
  g.add(bolt);
});

const createFireSuppression = staticView((g) => {
  const red = mat(0xc62828, { roughness: 0.35 });
  for (const x of [-0.2, 0.2]) {
    const tank = cylinder(0.17, 1.1, red, 0.55, 16);
    tank.position.x = x;
    g.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    cap.position.set(x, 1.1, 0);
    g.add(cap);
    const valve = cylinder(0.04, 0.12, capMat, 1.3, 8);
    valve.position.x = x;
    g.add(valve);
  }
  g.add(box(0.5, 0.04, 0.04, capMat, 1.38));
  const label = box(0.14, 0.2, 0.01, whiteMat, 0.6);
  label.position.set(-0.2, 0.6, 0.172);
  g.add(label);
});

const createFirewall = staticView((g) => {
  g.add(box(0.8, 0.9, 0.7, mat(0x1d1f26)));
  for (let i = 0; i < 6; i++) {
    const unit = box(0.7, 0.1, 0.02, mat(0x2a2d36), 0.12 + i * 0.13);
    unit.position.z = 0.355;
    g.add(unit);
    for (let j = 0; j < 4; j++) {
      const led = box(0.03, 0.03, 0.01, glow(i % 3 === 0 ? 0xff5a5f : 0xffb347, 1.4), 0.12 + i * 0.13);
      led.position.set(0.2 + j * 0.04, 0.12 + i * 0.13, 0.37);
      g.add(led);
    }
  }
  const shield = box(0.22, 0.26, 0.02, glow(0xff8a2a, 0.6), 1.05);
  shield.position.z = 0.0;
  g.add(shield);
});

function spinningFan(radius: number, y: number): THREE.Group {
  const fan = new THREE.Group();
  fan.position.y = y;
  const bladeGeo = new THREE.BoxGeometry(radius * 1.7, 0.02, radius * 0.3);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, whiteMat);
    blade.rotation.y = (i * Math.PI) / 3;
    fan.add(blade);
  }
  return fan;
}

const fanSpeed = (state: GameState, dt: number): number =>
  state.paused || state.bankrupt ? 0 : dt * 8 * state.speed * powerEfficiency(state);

// White unit with a spinning fan on top. The fan slows in a brownout.
function createCoolingFanView(): BuildingView {
  const group = new THREE.Group();
  group.add(box(0.85, 0.9, 0.85, whiteMat));
  group.add(cylinder(0.34, 0.04, fanMat, 0.92, 20));
  const fan = spinningFan(0.34, 0.96);
  group.add(fan);
  const showUpgrade = addUpgradeMarks(group, 0.9, 0.85, 0.85);
  return {
    group,
    update(state, building, dt) {
      showUpgrade(building.upgrade);
      fan.rotation.y += fanSpeed(state, dt);
    },
  };
}

// Tall, slim white cabinet with blue vent slats, sized to sit in a rack row.
function createInRowView(): BuildingView {
  const group = new THREE.Group();
  group.add(box(0.5, 1.7, 0.85, whiteMat));
  const slatMat = glow(0x4fb3ff, 0.5);
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.02), slatMat);
    slat.position.set(0, 0.3 + i * 0.18, 0.435);
    group.add(slat);
  }
  const showUpgrade = addUpgradeMarks(group, 1.7, 0.5, 0.85);
  return { group, update: (_state, building) => showUpgrade(building.upgrade) };
}

// Big grey box with two fans on top and a pair of blue coolant pipes.
function createChillerView(): BuildingView {
  const group = new THREE.Group();
  group.add(box(0.9, 0.75, 0.9, mat(0x7d8792, { metalness: 0.3 })));
  const fans: THREE.Group[] = [];
  for (const x of [-0.21, 0.21]) {
    const ring = cylinder(0.18, 0.03, fanMat, 0.77, 16);
    ring.position.x = x;
    group.add(ring);
    const fan = spinningFan(0.17, 0.8);
    fan.position.x = x;
    group.add(fan);
    fans.push(fan);
  }
  const pipeMat = mat(0x2f6bff, { metalness: 0.4, roughness: 0.3 });
  for (const x of [-0.15, 0.15]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.12, 0.5);
    group.add(pipe);
  }
  const showUpgrade = addUpgradeMarks(group, 0.75, 0.9, 0.9);
  return {
    group,
    update(state, building, dt) {
      showUpgrade(building.upgrade);
      const running = building.status === 'ok';
      for (const fan of fans) fan.rotation.y += running ? fanSpeed(state, dt) : 0;
    },
  };
}

function staticView(build: (group: THREE.Group) => void): () => BuildingView {
  return () => {
    const group = new THREE.Group();
    build(group);
    return { group, update() {} };
  };
}

const potMat = mat(0xb5653a);
const leafMat = mat(0x3f9b4a, { roughness: 0.8 });

const createPlantSmall = staticView((g) => {
  g.add(cylinder(0.16, 0.25, potMat));
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), leafMat);
  bush.position.y = 0.45;
  bush.castShadow = true;
  g.add(bush);
});

const createPlantTree = staticView((g) => {
  g.add(cylinder(0.22, 0.3, potMat));
  g.add(cylinder(0.04, 0.6, mat(0x6b4a2e), 0.55, 8));
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 8), leafMat);
  crown.position.y = 1.2;
  crown.castShadow = true;
  g.add(crown);
});

const createLightPillar = staticView((g) => {
  g.add(cylinder(0.2, 0.08, darkMat, 0.04));
  g.add(cylinder(0.06, 1.8, darkMat, 0.98, 10));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.6, 0.03), glow(0x7de0ff, 1.2));
  strip.position.set(0, 0.98, 0.065);
  g.add(strip);
});

const createReceptionDesk = staticView((g) => {
  const wood = mat(0xd9c8a9);
  g.add(box(0.9, 0.5, 0.35, wood));
  const side = box(0.35, 0.5, 0.55, wood);
  side.position.set(-0.275, 0.25, -0.1);
  g.add(side);
  const top = box(0.94, 0.04, 0.4, mat(0xf3f3f3), 0.52);
  g.add(top);
  const screen = box(0.25, 0.18, 0.02, darkMat, 0.65);
  screen.position.z = -0.05;
  g.add(screen);
});

const createCompanySign = staticView((g) => {
  g.add(box(0.12, 1.2, 0.12, darkMat));
  const sign = box(0.8, 0.4, 0.06, mat(0x1b2230), 1.35);
  g.add(sign);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.01), glow(0x8f7cff, 1));
  face.position.set(0, 1.35, 0.036);
  g.add(face);
});

const createServerShowcase = staticView((g) => {
  g.add(box(0.7, 0.5, 0.7, mat(0x2a2f36)));
  const glass = box(0.6, 0.9, 0.6, mat(0xbfe3ff, { transparent: true, opacity: 0.25, roughness: 0.05 }), 0.95);
  glass.castShadow = false;
  g.add(glass);
  // A tiny vintage server inside, with amber lights.
  g.add(box(0.3, 0.45, 0.3, mat(0xc9c2b0), 0.73));
  const lights = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.01), glow(0xffb347, 1));
  lights.position.set(0, 0.8, 0.152);
  g.add(lights);
});

// Big wall-mounted-style AC cabinet with a wide fan grille and blue status strip.
function createRoomAcView(): BuildingView {
  const group = new THREE.Group();
  group.add(box(0.9, 1.4, 0.7, whiteMat));
  const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), fanMat);
  grille.rotation.x = Math.PI / 2;
  grille.position.set(0, 0.85, 0.36);
  group.add(grille);
  const fan = spinningFan(0.28, 0);
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, 0.85, 0.385);
  group.add(fan);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.02), glow(0x4fb3ff, 0.9));
  strip.position.set(0, 0.3, 0.36);
  group.add(strip);
  const showUpgrade = addUpgradeMarks(group, 1.4, 0.9, 0.7);
  return {
    group,
    update(state, building, dt) {
      showUpgrade(building.upgrade);
      fan.rotation.y += fanSpeed(state, dt);
    },
  };
}

const wood = mat(0xb08a5a);
const metal = mat(0x9aa3ad, { metalness: 0.5, roughness: 0.4 });

const createBreakTable = staticView((g) => {
  g.add(cylinder(0.32, 0.04, wood, 0.55, 20));
  g.add(cylinder(0.05, 0.53, metal, 0.27, 8));
  for (const [x, z] of [[-0.38, 0], [0.38, 0], [0, -0.38], [0, 0.38]] as const) {
    const stool = cylinder(0.1, 0.32, mat(0x4aa8ff), 0.16, 10);
    stool.position.set(x, 0.16, z);
    g.add(stool);
  }
});

const createCoffeeMachine = staticView((g) => {
  g.add(box(0.6, 0.7, 0.45, mat(0x30353d)));
  const body = box(0.44, 0.5, 0.4, mat(0x1d2127), 0.95);
  g.add(body);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.01), glow(0xff6a3a, 1));
  light.position.set(0, 1.05, 0.205);
  g.add(light);
  const cup = cylinder(0.04, 0.08, whiteMat, 0.74, 8);
  cup.position.z = 0.12;
  g.add(cup);
});

const createLockers = staticView((g) => {
  for (let i = 0; i < 3; i++) {
    const door = box(0.27, 1.6, 0.4, mat([0x4a62e8, 0x3fbf6a, 0xe8603a][i]!, { metalness: 0.3 }));
    door.position.set(-0.28 + i * 0.28, 0.8, 0);
    g.add(door);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.01), darkMat);
    vent.position.set(-0.28 + i * 0.28, 1.35, 0.205);
    g.add(vent);
  }
});

const createShelving = staticView((g) => {
  for (const x of [-0.4, 0.4]) {
    const post = box(0.04, 1.7, 0.4, metal);
    post.position.x = x;
    g.add(post);
  }
  const boxColours = [0xc9a227, 0x6b7280, 0x4aa8ff, 0xb08a5a];
  for (let s = 0; s < 4; s++) {
    g.add(box(0.84, 0.03, 0.42, metal, 0.15 + s * 0.45));
    for (let i = 0; i < 3; i++) {
      const crate = box(0.2, 0.22, 0.3, mat(boxColours[(s + i) % 4]!), 0.28 + s * 0.45);
      crate.position.x = -0.26 + i * 0.26;
      g.add(crate);
    }
  }
});

const createWaterCooler = staticView((g) => {
  g.add(box(0.32, 0.9, 0.32, whiteMat));
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.4, 12),
    mat(0x7fc8ff, { transparent: true, opacity: 0.6, roughness: 0.1 }),
  );
  bottle.position.y = 1.1;
  g.add(bottle);
});

const createSofa = staticView((g) => {
  const fabric = mat(0x5a4b8a, { roughness: 0.9 });
  g.add(box(0.9, 0.3, 0.55, fabric, 0.2));
  const back = box(0.9, 0.45, 0.15, fabric, 0.5);
  back.position.z = -0.2;
  g.add(back);
  for (const x of [-0.42, 0.42]) {
    const arm = box(0.08, 0.38, 0.55, fabric, 0.3);
    arm.position.x = x;
    g.add(arm);
  }
});

const createArcade = staticView((g) => {
  g.add(box(0.55, 1.7, 0.6, mat(0x2a1f4a)));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.02), glow(0x3fcf6a, 0.9));
  screen.position.set(0, 1.25, 0.3);
  screen.rotation.x = -0.25;
  g.add(screen);
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.02), glow(0xff5ab8, 1));
  marquee.position.set(0, 1.6, 0.3);
  g.add(marquee);
  const panel = box(0.5, 0.06, 0.25, mat(0x161226), 0.95);
  panel.position.z = 0.3;
  g.add(panel);
});

const createNeonSign = staticView((g) => {
  g.add(box(0.08, 1.0, 0.08, darkMat));
  g.add(box(0.95, 0.42, 0.05, mat(0x10131a), 1.2));
  const lit = glow(0x2bd4c4, 1.6);
  for (let i = 0; i < 6; i++) {
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.02), lit);
    letter.position.set(-0.36 + i * 0.145, 1.2, 0.03);
    g.add(letter);
  }
});

const createAquarium = staticView((g) => {
  g.add(box(0.9, 0.5, 0.45, mat(0x2a2f36)));
  const water = box(0.86, 0.6, 0.4, mat(0x2f9be0, { transparent: true, opacity: 0.45, roughness: 0.05 }), 0.82);
  water.castShadow = false;
  g.add(water);
  for (const [x, y, c] of [[-0.2, 0.75, 0xff9a3a], [0.15, 0.9, 0xffd23a], [0.25, 0.7, 0xff5a5f]] as const) {
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(c));
    fish.scale.set(1.6, 1, 0.6);
    fish.position.set(x, y, 0);
    g.add(fish);
  }
});

const createTrophyCase = staticView((g) => {
  g.add(box(0.8, 0.4, 0.5, mat(0x3a2a1e)));
  const glass = box(0.76, 1.1, 0.46, mat(0xdff0ff, { transparent: true, opacity: 0.2, roughness: 0.05 }), 0.95);
  glass.castShadow = false;
  g.add(glass);
  const gold = mat(0xffd23a, { metalness: 0.8, roughness: 0.25 });
  for (const [x, y] of [[-0.2, 0.55], [0.2, 0.55], [0, 1.0]] as const) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.18, 10), gold);
    cup.position.set(x, y, 0);
    g.add(cup);
  }
});

// Places a mesh at x/z (box and cylinder already set its height).
const at = <T extends THREE.Object3D>(obj: T, x: number, z = 0, y?: number): T => {
  obj.position.x = x;
  obj.position.z = z;
  if (y !== undefined) obj.position.y = y;
  return obj;
};
const glass =(color = 0xdff0ff, opacity = 0.25): THREE.MeshStandardMaterial =>
  mat(color, { transparent: true, opacity, roughness: 0.05 });

const createBench = staticView((g) => {
  for (const x of [-0.38, 0.38]) g.add(at(box(0.06, 0.3, 0.4, metal), x));
  for (let i = 0; i < 3; i++) g.add(at(box(0.9, 0.035, 0.1, wood, 0.32), 0, -0.12 + i * 0.12));
  for (let i = 0; i < 2; i++) g.add(at(box(0.9, 0.08, 0.03, wood, 0.48 + i * 0.13), 0, -0.2));
});

const createCactus = staticView((g) => {
  g.add(cylinder(0.14, 0.2, potMat, 0.1, 12));
  const cactusMat = mat(0x4f9a4a, { roughness: 0.8 });
  g.add(cylinder(0.08, 0.55, cactusMat, 0.47, 10));
  g.add(at(cylinder(0.05, 0.22, cactusMat, 0.55, 8), 0.12));
  g.add(at(cylinder(0.04, 0.18, cactusMat, 0.48, 8), -0.11));
  g.add(at(box(0.12, 0.04, 0.04, cactusMat, 0.45), 0.07));
  g.add(at(box(0.1, 0.04, 0.04, cactusMat, 0.4), -0.06));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xff6a9a)), 0, 0, 0.76));
});

const createBookshelf = staticView((g) => {
  const shelfWood = mat(0x6e4a2e);
  g.add(at(box(0.9, 1.7, 0.06, shelfWood), 0, -0.17));
  for (const x of [-0.43, 0.43]) g.add(at(box(0.04, 1.7, 0.4, shelfWood), x));
  const spines = [0xb03a3a, 0x2f6fb0, 0x3fbf6a, 0xd8b26a, 0x7a4ff0, 0x30343a, 0xe8603a];
  for (let s = 0; s < 4; s++) {
    g.add(box(0.86, 0.03, 0.4, shelfWood, 0.05 + s * 0.42));
    let x = -0.38;
    for (let i = 0; x < 0.36; i++) {
      const w = 0.05 + ((s * 7 + i * 3) % 4) * 0.012;
      const h = 0.26 + ((s + i * 5) % 3) * 0.04;
      g.add(at(box(w, h, 0.28, mat(spines[(s * 3 + i) % spines.length]!), 0.065 + s * 0.42 + h / 2), x + w / 2, 0.02));
      x += w + 0.008;
    }
  }
});

const createFloorLamp = staticView((g) => {
  g.add(cylinder(0.16, 0.03, darkMat, 0.015, 16));
  g.add(cylinder(0.02, 1.4, metal, 0.72, 8));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.24, 16, 1, true), mat(0xf3e6c8, { side: THREE.DoubleSide }));
  shade.position.y = 1.45;
  g.add(shade);
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(0xffe0a0, 1.4)), 0, 0, 1.4));
});

const createRug = staticView((g) => {
  const rug = box(0.95, 0.015, 0.95, mat(0x8a3a4a, { roughness: 0.95 }));
  rug.castShadow = false;
  g.add(rug);
  const inner = box(0.7, 0.017, 0.7, mat(0xd8b26a, { roughness: 0.95 }));
  inner.castShadow = false;
  g.add(inner);
  const centre = box(0.4, 0.019, 0.4, mat(0x2f4f6f, { roughness: 0.95 }));
  centre.castShadow = false;
  g.add(centre);
});

const createWhiteboard = staticView((g) => {
  for (const x of [-0.4, 0.4]) g.add(at(box(0.04, 1.5, 0.04, metal), x));
  for (const x of [-0.4, 0.4]) g.add(at(box(0.06, 0.03, 0.4, metal, 0.015), x));
  g.add(box(0.86, 0.6, 0.03, mat(0xf6f8fa, { roughness: 0.2 }), 1.1));
  const ink = [0x2f6fb0, 0xd13f3f, 0x3fbf6a];
  for (let i = 0; i < 4; i++) {
    g.add(at(box(0.3 + (i % 2) * 0.2, 0.025, 0.005, mat(ink[i % 3]!), 1.3 - i * 0.1), -0.15 + (i % 2) * 0.05, 0.018));
  }
  g.add(at(box(0.7, 0.03, 0.06, metal, 0.78), 0, 0.03));
});

const createCoffeeTable = staticView((g) => {
  g.add(box(0.8, 0.05, 0.5, glass(0xc8e4f0, 0.5), 0.38));
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]] as const) {
    g.add(at(box(0.04, 0.36, 0.04, metal), x, z));
  }
  g.add(at(box(0.7, 0.02, 0.4, wood, 0.12), 0));
  g.add(at(cylinder(0.04, 0.08, whiteMat, 0.45, 10), 0.18, 0.05));
  g.add(at(box(0.22, 0.03, 0.16, mat(0x2f6fb0), 0.42), -0.15, -0.02));
});

const createBeanBag = staticView((g) => {
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(0xe8603a, { roughness: 0.95 }));
  bag.scale.set(1.1, 0.7, 1.1);
  bag.position.y = 0.2;
  bag.castShadow = true;
  g.add(bag);
  const dent = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat(0xd04f2c, { roughness: 0.95 }));
  dent.scale.set(1, 0.5, 1);
  dent.position.set(0, 0.36, 0.05);
  g.add(dent);
});

const createVendingMachine = staticView((g) => {
  g.add(box(0.7, 1.8, 0.6, mat(0xc0302e)));
  g.add(at(box(0.46, 1.22, 0.02, mat(0x1a1d22), 1.05), -0.08, 0.305));
  const snacks = [0xffd23a, 0x3fbf6a, 0x4aa8ff, 0xff8a2a, 0xa346e6];
  for (let r = 0; r < 5; r++) {
    g.add(at(box(0.44, 0.015, 0.06, metal, 0.53 + r * 0.22), -0.08, 0.335));
    for (let c = 0; c < 4; c++) {
      g.add(at(box(0.07, 0.12, 0.04, mat(snacks[(r + c) % 5]!), 0.6 + r * 0.22), -0.245 + c * 0.11, 0.335));
    }
  }
  g.add(at(box(0.46, 1.22, 0.01, glass(0xdff0ff, 0.18), 1.05), -0.08, 0.365));
  g.add(at(box(0.14, 0.4, 0.02, darkMat, 1.2), 0.24, 0.31));
  g.add(at(box(0.1, 0.06, 0.02, glow(0x5dff9a, 1), 1.35), 0.24, 0.32));
  g.add(at(box(0.44, 0.14, 0.03, darkMat, 0.25), -0.08, 0.31));
});

const createBonsai = staticView((g) => {
  g.add(box(0.4, 0.12, 0.28, mat(0x2a3a5a), 0.06));
  const trunkMat = mat(0x5a3a24);
  const trunk = cylinder(0.035, 0.32, trunkMat, 0.28, 8);
  trunk.rotation.z = 0.3;
  g.add(trunk);
  const branch = at(cylinder(0.02, 0.2, trunkMat, 0.38, 6), 0.1);
  branch.rotation.z = -0.9;
  g.add(branch);
  for (const [x, y, r] of [[-0.06, 0.48, 0.13], [0.16, 0.44, 0.1], [0.02, 0.58, 0.09]] as const) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
    pad.scale.y = 0.55;
    pad.position.set(x, y, 0);
    pad.castShadow = true;
    g.add(pad);
  }
});

const createPingPong = staticView((g) => {
  g.add(box(0.95, 0.04, 0.6, mat(0x1f5f9a), 0.6));
  g.add(at(box(0.95, 0.005, 0.01, whiteMat, 0.62), 0));
  g.add(box(0.012, 0.1, 0.62, mat(0xeeeeee, { transparent: true, opacity: 0.7 }), 0.67));
  for (const [x, z] of [[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]] as const) {
    g.add(at(box(0.04, 0.58, 0.04, darkMat), x, z));
  }
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat(0xff9a3a)), 0.2, 0.1, 0.66));
  const paddle = at(cylinder(0.06, 0.012, mat(0xd13f3f), 0.63, 12), -0.3, 0.12);
  g.add(paddle);
});

const createPoolTable = staticView((g) => {
  g.add(box(0.98, 0.12, 0.62, mat(0x5a3420), 0.66));
  g.add(box(0.86, 0.02, 0.5, mat(0x1f7a3f, { roughness: 0.95 }), 0.73));
  for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]] as const) {
    g.add(at(box(0.09, 0.6, 0.09, mat(0x4a2a18)), x, z));
  }
  const balls = [0xffd23a, 0x2f6fb0, 0xd13f3f, 0x7a4ff0, 0xff8a2a, 0x1a1a1a, 0xffffff];
  balls.forEach((c, i) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(c, { roughness: 0.3 }));
    ball.position.set(i === 6 ? -0.25 : 0.12 + (i % 3) * 0.045, 0.765, i === 6 ? 0 : -0.05 + Math.floor(i / 3) * 0.05);
    g.add(ball);
  });
  const cue = at(cylinder(0.008, 0.8, wood, 0.76, 6), -0.05, 0.2);
  cue.rotation.z = Math.PI / 2;
  g.add(cue);
});

const createFountain = staticView((g) => {
  const stone = mat(0xc9c4b8, { roughness: 0.8 });
  g.add(cylinder(0.45, 0.22, stone, 0.11, 24));
  const pool = cylinder(0.4, 0.04, mat(0x3fa7e0, { transparent: true, opacity: 0.7, roughness: 0.05 }), 0.21, 24);
  pool.castShadow = false;
  g.add(pool);
  g.add(cylinder(0.08, 0.5, stone, 0.4, 12));
  g.add(cylinder(0.2, 0.05, stone, 0.66, 18));
  const jet = cylinder(0.03, 0.3, mat(0x9fd8ff, { transparent: true, opacity: 0.6, emissive: 0x3fa7e0, emissiveIntensity: 0.3 }), 0.83, 8);
  jet.castShadow = false;
  g.add(jet);
});

const createGlobe = staticView((g) => {
  g.add(cylinder(0.18, 0.03, wood, 0.015, 16));
  g.add(cylinder(0.025, 0.55, wood, 0.3, 8));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.012, 6, 28), mat(0xd8b26a, { metalness: 0.7, roughness: 0.3 }));
  ring.position.y = 0.85;
  g.add(ring);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), mat(0x2f7fc0, { roughness: 0.5 }));
  earth.position.y = 0.85;
  earth.rotation.z = 0.4;
  earth.castShadow = true;
  g.add(earth);
  for (const [x, y, z, s] of [[0.12, 0.92, 0.15, 0.09], [-0.15, 0.8, 0.12, 0.07], [0.05, 0.75, -0.18, 0.08]] as const) {
    const land = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat(0x4f9a4a));
    land.position.set(x, y, z);
    land.scale.set(1, 0.6, 0.5);
    g.add(land);
  }
});

const createStatusWall = staticView((g) => {
  for (const x of [-0.35, 0.35]) g.add(at(box(0.05, 0.9, 0.05, darkMat), x));
  g.add(box(0.98, 0.6, 0.06, mat(0x15181e), 1.15));
  g.add(at(box(0.92, 0.54, 0.01, glow(0x0f2a3a, 0.5), 1.15), 0, 0.035));
  // Bar chart and a status grid.
  for (let i = 0; i < 6; i++) {
    const h = 0.08 + ((i * 7) % 5) * 0.05;
    g.add(at(box(0.05, h, 0.01, glow(0x4fb3ff, 1.1), 0.95 + h / 2), -0.38 + i * 0.07, 0.042));
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const colour = (r * 4 + c) % 7 === 3 ? 0xffb347 : 0x5dff9a;
      g.add(at(box(0.06, 0.06, 0.01, glow(colour, 1.2), 1.3 - r * 0.1), 0.12 + c * 0.09, 0.042));
    }
  }
});

const createSculpture = staticView((g) => {
  g.add(box(0.5, 0.5, 0.5, mat(0xe8e8e8, { roughness: 0.4 })));
  // No environment map, so keep metalness low or it renders black.
  const chrome = mat(0xb8d4f0, { metalness: 0.35, roughness: 0.2, emissive: 0x1a3a6a, emissiveIntensity: 0.25 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.05, 64, 10, 2, 3), chrome);
  knot.position.y = 0.85;
  knot.castShadow = true;
  g.add(knot);
});

const createCircuitArt = staticView((g) => {
  for (const x of [-0.3, 0.3]) g.add(at(box(0.04, 0.8, 0.04, darkMat), x, -0.1));
  g.add(at(box(0.9, 0.65, 0.05, mat(0x1d5a3a), 1.1), 0, -0.1));
  const copper = glow(0xffb347, 0.6);
  for (let i = 0; i < 5; i++) {
    g.add(at(box(0.6 - i * 0.08, 0.015, 0.01, copper, 0.88 + i * 0.1), -0.05 + (i % 2) * 0.08, -0.07));
    g.add(at(box(0.015, 0.2 + (i % 3) * 0.08, 0.01, copper, 1.0 + (i % 2) * 0.08), -0.35 + i * 0.17, -0.07));
  }
  g.add(at(box(0.18, 0.18, 0.03, darkMat, 1.12), 0.05, -0.06));
  g.add(at(box(0.04, 0.04, 0.01, glow(0x5dff9a, 1.4), 1.3), 0.32, -0.06));
});

const createPiano = staticView((g) => {
  const black = mat(0x111214, { roughness: 0.2, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 24, 1, false, 0, Math.PI), black);
  body.rotation.y = -Math.PI / 2;
  body.position.set(0, 0.72, -0.05);
  body.scale.set(1, 1, 0.9);
  body.castShadow = true;
  g.add(body);
  g.add(at(box(0.84, 0.22, 0.2, black, 0.72), 0, 0.1));
  g.add(at(box(0.78, 0.03, 0.12, whiteMat, 0.66), 0, 0.26));
  for (let i = 0; i < 9; i++) g.add(at(box(0.035, 0.02, 0.07, black, 0.685), -0.33 + i * 0.085, 0.24));
  for (const [x, z] of [[-0.35, 0.1], [0.35, 0.1], [0.3, -0.35]] as const) g.add(at(box(0.06, 0.6, 0.06, black), x, z));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 24, 1, false, 0, Math.PI), black);
  lid.rotation.set(0.6, -Math.PI / 2, 0);
  lid.position.set(0, 1.0, -0.15);
  g.add(lid);
});

const createRobotMascot = staticView((g) => {
  const shell = mat(0xdfe6ee, { metalness: 0.4, roughness: 0.3 });
  const accent = mat(0x4aa8ff, { metalness: 0.3 });
  for (const x of [-0.1, 0.1]) g.add(at(box(0.1, 0.4, 0.12, accent), x));
  g.add(box(0.4, 0.45, 0.28, shell, 0.65));
  g.add(at(box(0.16, 0.1, 0.01, glow(0x5dff9a, 1.2), 0.7), 0, 0.145));
  for (const x of [-0.26, 0.26]) {
    const arm = at(box(0.08, 0.38, 0.1, accent, 0.62), x);
    arm.rotation.z = x < 0 ? -0.2 : 0.5;
    g.add(arm);
  }
  g.add(box(0.32, 0.26, 0.26, shell, 1.03));
  g.add(at(box(0.26, 0.1, 0.01, darkMat, 1.05), 0, 0.135));
  for (const x of [-0.06, 0.06]) g.add(at(box(0.04, 0.04, 0.01, glow(0x4fb3ff, 1.6), 1.05), x, 0.142));
  g.add(cylinder(0.01, 0.14, metal, 1.23, 6));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(0xff5a5f, 1.5)), 0, 0, 1.31));
});

const createGoldenServer = staticView((g) => {
  g.add(box(0.8, 0.25, 0.8, mat(0x2a2f36, { roughness: 0.4 })));
  g.add(box(0.7, 0.04, 0.7, mat(0x8a1f2a, { roughness: 0.9 }), 0.27));
  const gold = mat(0xffcf3a, { metalness: 0.35, roughness: 0.25, emissive: 0xb07a00, emissiveIntensity: 0.35 });
  g.add(box(0.42, 1.3, 0.45, gold, 0.94));
  for (let i = 0; i < 8; i++) g.add(at(box(0.36, 0.02, 0.01, mat(0xc89a28, { metalness: 0.3 }), 0.45 + i * 0.13), 0, 0.23));
  for (let i = 0; i < 6; i++) g.add(at(box(0.025, 0.025, 0.01, glow(0xffffff, 1.5), 0.5 + i * 0.16), 0.15, 0.235));
});

// Every building id has a model. TypeScript enforces that new ids get one.
const FACTORIES: Record<BuildingKind, () => BuildingView> = {
  power_gas: createGasGenerator,
  power_solar: createSolarArray,
  power_fuelcell: createFuelCell,
  power_substation: createSubstation,
  power_reactor: createReactor,
  ups_battery: createUps,
  fire_suppression: createFireSuppression,
  firewall: createFirewall,
  bench: createBench,
  cactus: createCactus,
  bookshelf: createBookshelf,
  floor_lamp: createFloorLamp,
  rug: createRug,
  whiteboard: createWhiteboard,
  coffee_table: createCoffeeTable,
  bean_bag: createBeanBag,
  vending_machine: createVendingMachine,
  bonsai: createBonsai,
  ping_pong: createPingPong,
  pool_table: createPoolTable,
  fountain: createFountain,
  globe: createGlobe,
  status_wall: createStatusWall,
  sculpture: createSculpture,
  circuit_art: createCircuitArt,
  piano: createPiano,
  robot_mascot: createRobotMascot,
  golden_server: createGoldenServer,
  cooling_ac: createRoomAcView,
  break_table: createBreakTable,
  coffee_machine: createCoffeeMachine,
  lockers: createLockers,
  shelving: createShelving,
  water_cooler: createWaterCooler,
  sofa: createSofa,
  arcade_cabinet: createArcade,
  neon_sign: createNeonSign,
  aquarium: createAquarium,
  trophy_case: createTrophyCase,
  rack_basic: () => createRackView(RACK_LOOKS.rack_basic!),
  rack_performance: () => createRackView(RACK_LOOKS.rack_performance!),
  rack_enterprise: () => createRackView(RACK_LOOKS.rack_enterprise!),
  rack_gpu: () => createRackView(RACK_LOOKS.rack_gpu!),
  rack_hyperscale: () => createRackView(RACK_LOOKS.rack_hyperscale!),
  power_basic: createPowerView,
  cooling_fan: createCoolingFanView,
  cooling_inrow: createInRowView,
  chiller: createChillerView,
  plant_small: createPlantSmall,
  light_pillar: createLightPillar,
  plant_tree: createPlantTree,
  desk_reception: createReceptionDesk,
  sign_company: createCompanySign,
  server_showcase: createServerShowcase,
};

const scaffoldMat = new THREE.LineBasicMaterial({ color: 0xffb347 });
const progressBgMat = new THREE.MeshBasicMaterial({ color: 0x1b2028 });
const progressMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });

// Orange scaffolding and a progress bar shown while a building is under
// construction; the model itself rises out of the floor as work goes on.
function createScaffold(): { group: THREE.Group; bar: THREE.Mesh } {
  const group = new THREE.Group();
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.96, 1.9, 0.96)), scaffoldMat);
  frame.position.y = 0.95;
  group.add(frame);
  const bg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.04), progressBgMat);
  bg.position.y = 2.15;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.05), progressMat);
  bar.position.y = 2.15;
  group.add(bg, bar);
  return { group, bar };
}

// A red "!" badge drawn on a canvas, shown as a sprite so it always faces the
// camera: marks failed buildings that need clicking to repair.
let alertMat: THREE.SpriteMaterial | null = null;
function alertMaterial(): THREE.SpriteMaterial {
  if (alertMat) return alertMat;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3b45';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', c, c + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Drawn over everything so it shows even behind other racks.
  alertMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  return alertMat;
}

function createAlert(): THREE.Sprite {
  const sprite = new THREE.Sprite(alertMaterial());
  sprite.scale.setScalar(0.55);
  sprite.renderOrder = 10;
  return sprite;
}

interface PlacedView extends BuildingView {
  model: THREE.Group;
  scaffold: { group: THREE.Group; bar: THREE.Mesh } | null;
  alert: THREE.Sprite | null;
}

// Keeps one view per building in GameState. Reads state, never writes it.
export class BuildingLayer {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, PlacedView>();
  // Buildings being carried by the move tool: drawn lifted at the cursor.
  private carried = new Map<number, { x: number; y: number; rot: number }>();

  // The "!" badges over failed buildings, each tagged with its building id.
  alerts(): THREE.Sprite[] {
    const out: THREE.Sprite[] = [];
    for (const view of this.views.values()) if (view.alert) out.push(view.alert);
    return out;
  }

  carry(list: { id: number; x: number; y: number; rot: number }[]): void {
    this.carried = new Map(list.map((c) => [c.id, c]));
  }

  sync(state: GameState, dt: number): void {
    const alive = new Set<number>();
    for (const building of state.buildings) {
      alive.add(building.id);
      let view = this.views.get(building.id);
      if (!view) {
        const inner = FACTORIES[building.kind]();
        const holder = new THREE.Group();
        holder.add(inner.group);
        holder.position.copy(tileToWorld(state.width, state.height, building.x, building.y));
        view = { group: holder, model: inner.group, update: inner.update, scaffold: null, alert: null };
        this.views.set(building.id, view);
        this.group.add(holder);
      }
      // Buildings can move, so follow the sim every frame (or the cursor while carried).
      const carried = this.carried.get(building.id) ?? null;
      view.group.position.copy(
        tileToWorld(state.width, state.height, carried ? carried.x : building.x, carried ? carried.y : building.y),
      );
      if (carried) view.group.position.y = 0.25 + Math.sin(performance.now() / 180) * 0.05;
      // rot 0 faces +z (towards the camera); each step turns a quarter clockwise from above.
      view.model.rotation.y = ((carried ? carried.rot : building.rot) * Math.PI) / 2;

      if (building.status === 'building') {
        if (!view.scaffold) {
          view.scaffold = createScaffold();
          view.group.add(view.scaffold.group);
        }
        const total = buildTicks(building.kind);
        const progress = total > 0 ? 1 - building.buildRemaining / total : 1;
        view.model.scale.y = 0.08 + 0.92 * progress;
        view.scaffold.bar.scale.x = Math.max(0.001, progress);
        view.scaffold.bar.position.x = -0.4 * (1 - progress);
      } else if (view.scaffold) {
        view.group.remove(view.scaffold.group);
        view.scaffold = null;
        view.model.scale.y = 1;
      }
      if (building.status === 'failed') {
        if (!view.alert) {
          view.alert = createAlert();
          view.alert.userData.buildingId = building.id;
          view.group.add(view.alert);
        }
        // Bob and pulse gently so it catches the eye.
        const t = performance.now() / 1000;
        view.alert.position.y = 2.45 + Math.sin(t * 3 + building.id) * 0.08;
        view.alert.scale.setScalar(0.55 + Math.sin(t * 6 + building.id) * 0.04);
      } else if (view.alert) {
        view.group.remove(view.alert);
        view.alert = null;
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

const blockFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.4, roughness: 0.5 });
const blockGlowMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffd23a, emissiveIntensity: 0.8 });

// A shared frame with a glowing strip around each 2×2 power multiblock.
export class MultiblockLayer {
  readonly group = new THREE.Group();
  private key = '';

  sync(state: GameState): void {
    const corners = powerMultiblocks(state).corners;
    const key = corners.map((c) => `${c.x},${c.y}`).join(';');
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    for (const c of corners) {
      const a = tileToWorld(state.width, state.height, c.x, c.y);
      const centre = new THREE.Vector3(a.x + 0.5, 0, a.z + 0.5);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 1.98), blockFrameMat);
      base.position.set(centre.x, 0.03, centre.z);
      base.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.04, 2.02), blockGlowMat);
      ring.position.set(centre.x, 0.065, centre.z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 1.9), blockFrameMat);
      roof.position.set(centre.x, 1.1, centre.z);
      roof.castShadow = true;
      const roofGlow = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.03, 1.92), blockGlowMat);
      roofGlow.position.set(centre.x, 1.075, centre.z);
      this.group.add(base, ring, roof, roofGlow);
    }
  }
}

const ventGeo = new THREE.PlaneGeometry(0.92, 0.92);
const ventFedMat = new THREE.MeshStandardMaterial({ color: 0x9cc9ff, emissive: 0x2f6bff, emissiveIntensity: 0.35 });
const ventIdleMat = new THREE.MeshStandardMaterial({ color: 0x7a828c });
const slatGeo = new THREE.BoxGeometry(0.8, 0.006, 0.05);

// Floor vents: grated tiles on the floor, glowing blue while a chiller feeds them.
export class FloorLayer {
  readonly group = new THREE.Group();
  private readonly tiles = new Map<string, THREE.Mesh>();

  sync(state: GameState): void {
    const fed = feedVents(state).fed;
    const alive = new Set<string>();
    for (const f of state.floor) {
      const key = `${f.x},${f.y}`;
      alive.add(key);
      let mesh = this.tiles.get(key);
      if (!mesh) {
        mesh = new THREE.Mesh(ventGeo, ventIdleMat);
        mesh.rotation.x = -Math.PI / 2;
        const p = tileToWorld(state.width, state.height, f.x, f.y);
        mesh.position.set(p.x, 0.0012, p.z);
        mesh.receiveShadow = true;
        for (let i = 0; i < 5; i++) {
          const slat = new THREE.Mesh(slatGeo, darkMat);
          slat.rotation.x = Math.PI / 2;
          slat.position.set(0, -0.36 + i * 0.18, 0.003);
          mesh.add(slat);
        }
        this.tiles.set(key, mesh);
        this.group.add(mesh);
      }
      mesh.material = fed.has(f.y * state.width + f.x) ? ventFedMat : ventIdleMat;
    }
    for (const [key, mesh] of this.tiles) {
      if (alive.has(key)) continue;
      this.group.remove(mesh);
      this.tiles.delete(key);
    }
  }

  clear(): void {
    for (const mesh of this.tiles.values()) this.group.remove(mesh);
    this.tiles.clear();
  }
}
