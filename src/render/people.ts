import * as THREE from 'three';
import { CUSTOMER_TYPES } from '../sim/content/customers';
import type { GameState } from '../sim/state';

// Little low-poly people with legs, arms, a head and hair, and a walk cycle.
// Engineers wear hi-vis and a hard hat, technicians a uniform and cap,
// account managers a teal shirt and headset, sales reps purple with a
// briefcase, and clients a shirt in their company's colour with a tie and briefcase. Skin,
// hair and trousers vary per person. Positions glide towards the sim's.

const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68a5b, 0x8d5a3b, 0x5c3a24];
const HAIR = [0x2b1d14, 0x4a3020, 0x8a5a2b, 0xd8b26a, 0x1a1a1a, 0x9a9a9a, 0xa8432a];
const TROUSERS = [0x2a2f38, 0x3b4a63, 0x4a4036, 0x30343a];

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(colour: number, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${colour}:${roughness}:${metalness}`;
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness })));
  return m;
}

// Shared geometry. The figure is about 0.95 tiles tall; it faces +z.
const G = {
  leg: new THREE.CapsuleGeometry(0.045, 0.28, 4, 8),
  shoe: new THREE.BoxGeometry(0.075, 0.045, 0.13),
  torso: new THREE.CapsuleGeometry(0.1, 0.16, 4, 12),
  arm: new THREE.CapsuleGeometry(0.034, 0.22, 4, 8),
  hand: new THREE.SphereGeometry(0.038, 8, 6),
  neck: new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8),
  head: new THREE.SphereGeometry(0.095, 16, 12),
  hair: new THREE.SphereGeometry(0.101, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  eye: new THREE.SphereGeometry(0.013, 6, 4),
  dome: new THREE.SphereGeometry(0.108, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.135, 0.135, 0.012, 18),
  visor: new THREE.BoxGeometry(0.11, 0.012, 0.08),
  stripe: new THREE.CylinderGeometry(0.118, 0.118, 0.02, 18, 1, true),
  tie: new THREE.BoxGeometry(0.026, 0.13, 0.012),
  case: new THREE.BoxGeometry(0.04, 0.09, 0.13),
  band: new THREE.TorusGeometry(0.104, 0.008, 6, 20, Math.PI),
  mic: new THREE.SphereGeometry(0.014, 6, 4),
};

// manager: account manager (headset); sales: sales rep (dark briefcase).
type Kind = 'engineer' | 'technician' | 'client' | 'manager' | 'sales';

const STAFF_LOOK: Record<string, { kind: Kind; shirt: number }> = {
  engineer: { kind: 'engineer', shirt: 0xf28c28 },
  technician: { kind: 'technician', shirt: 0x2f6fb0 },
  account_manager: { kind: 'manager', shirt: 0x2aa39d },
  sales_rep: { kind: 'sales', shirt: 0x7a4fb8 },
};

interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

// Same person, same look, every time: pick from a list by a hash of their key.
function pickFrom<T>(list: readonly T[], key: string, salt: number): T {
  let h = salt;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length]!;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const out = new THREE.Mesh(geo, m);
  out.position.set(x, y, z);
  out.castShadow = true;
  return out;
}

// A limb hanging from a pivot (hip or shoulder), so rotating the pivot swings it.
function limb(x: number, y: number, parts: THREE.Object3D[]): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(...parts);
  return pivot;
}

function person(kind: Kind, key: string, shirtColour: number): Rig {
  const skin = mat(pickFrom(SKIN, key, 7));
  const hair = mat(pickFrom(HAIR, key, 13), 0.9);
  const trousers = mat(kind === 'client' ? pickFrom(TROUSERS, key, 3) : 0x2a3340, 0.9);
  const shirt = mat(shirtColour, 0.7);
  const shoe = mat(0x1b1d22, 0.6);

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const hip = 0.4;
  const leg = (side: number): THREE.Group =>
    limb(side * 0.055, hip, [mesh(G.leg, trousers, 0, -0.18), mesh(G.shoe, shoe, 0, -0.375, 0.022)]);
  const legL = leg(-1);
  const legR = leg(1);

  const torso = mesh(G.torso, shirt, 0, 0.58);
  torso.scale.set(1.15, 1, 0.75);

  const shoulder = 0.7;
  const arm = (side: number): THREE.Group =>
    limb(side * 0.145, shoulder, [mesh(G.arm, shirt, 0, -0.13), mesh(G.hand, skin, 0, -0.28)]);
  const armL = arm(-1);
  const armR = arm(1);
  armL.rotation.z = -0.08;
  armR.rotation.z = 0.08;

  const neck = mesh(G.neck, skin, 0, 0.78);
  const head = mesh(G.head, skin, 0, 0.875);
  head.scale.y = 1.08;
  const eyes = [-1, 1].map((s) => mesh(G.eye, mat(0x1a1a1a, 0.4), s * 0.034, 0.885, 0.085));
  body.add(legL, legR, torso, armL, armR, neck, head, ...eyes);

  if (kind === 'engineer') {
    // Hi-vis reflective bands and a hard hat.
    for (const y of [0.53, 0.62]) {
      const band = mesh(G.stripe, mat(0xd9e0e6, 0.3, 0.6), 0, y);
      band.scale.set(1.15, 1, 0.75);
      band.castShadow = false;
      body.add(band);
    }
    const hat = mat(0xffd23a, 0.45);
    body.add(mesh(G.dome, hat, 0, 0.905), mesh(G.brim, hat, 0, 0.905));
  } else if (kind === 'technician') {
    const cap = mat(0x1d3f66, 0.7);
    const capTop = mesh(G.dome, cap, 0, 0.91);
    capTop.scale.set(0.95, 0.7, 0.95);
    body.add(capTop, mesh(G.visor, cap, 0, 0.91, 0.11));
    // A little hair showing under the cap.
    const back = mesh(G.hair, hair, 0, 0.86, -0.01);
    back.rotation.x = -0.9;
    body.add(back);
  } else {
    const style = mesh(G.hair, hair, 0, 0.885, -0.008);
    style.rotation.x = -0.3;
    body.add(style, mesh(G.tie, mat(kind === 'client' ? 0x1d2230 : 0xd9e0e6, 0.6), 0, 0.62, 0.078));
    if (kind === 'manager') {
      // A headset: band over the head and a mic by the mouth.
      const band = mesh(G.band, mat(0x1b1d22, 0.5), 0, 0.89);
      band.rotation.z = Math.PI / 2;
      band.rotation.y = Math.PI / 2;
      body.add(band, mesh(G.mic, mat(0x1b1d22, 0.5), 0.07, 0.85, 0.07));
    } else {
      // Briefcase in the right hand (clients and sales reps).
      armR.add(mesh(G.case, mat(kind === 'sales' ? 0x1d2230 : 0x3a2a1e, 0.5), 0.02, -0.34, 0));
    }
  }

  return { group, body, legL, legR, armL, armR };
}

interface Figure {
  rig: Rig;
  target: THREE.Vector3;
  // Walk cycle phase (advances with distance walked) and how far into a stride.
  phase: number;
  swing: number;
}

export class PeopleLayer {
  readonly group = new THREE.Group();
  private readonly figures = new Map<string, Figure>();

  // Staff figures, for clicking someone to see their card.
  staffFigures(): THREE.Object3D[] {
    return [...this.figures.values()].map((f) => f.rig.group).filter((g) => g.userData.staffId !== undefined);
  }

  // The staff id of a picked part of a figure, if any.
  static staffIdOf(hit: THREE.Object3D | null): number | null {
    for (let o = hit; o; o = o.parent) if (o.userData.staffId !== undefined) return o.userData.staffId as number;
    return null;
  }

  sync(state: GameState, dt: number): void {
    const alive = new Set<string>();
    const now = performance.now() / 1000;

    const place = (key: string, make: () => Rig, x: number, y: number, working: boolean): void => {
      alive.add(key);
      let fig = this.figures.get(key);
      const target = new THREE.Vector3(x + 0.5 - state.width / 2, 0, y + 0.5 - state.height / 2);
      if (!fig) {
        fig = { rig: make(), target, phase: 0, swing: 0 };
        fig.rig.group.position.copy(target);
        this.figures.set(key, fig);
        this.group.add(fig.rig.group);
      }
      const { rig } = fig;
      fig.target.copy(target);

      // Glide towards the sim position and face the way they're walking.
      const before = rig.group.position.clone();
      const delta = fig.target.clone().sub(before);
      delta.y = 0;
      const moving = delta.lengthSq() > 0.0004;
      if (moving) {
        const want = Math.atan2(delta.x, delta.z);
        let turn = want - rig.group.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        rig.group.rotation.y += turn * Math.min(1, dt * 14);
      }
      rig.group.position.lerp(fig.target, Math.min(1, dt * 12));
      const moved = rig.group.position.distanceTo(before);

      // Walk cycle: legs and arms swing in opposite pairs, eased in and out.
      fig.phase += moved * 16;
      fig.swing += ((moving ? 1 : 0) - fig.swing) * Math.min(1, dt * 10);
      const s = Math.sin(fig.phase) * 0.6 * fig.swing;
      rig.legL.rotation.x = s;
      rig.legR.rotation.x = -s;
      rig.body.position.y = Math.abs(Math.cos(fig.phase)) * 0.02 * fig.swing;

      if (working && !moving) {
        // On the job: both hands forward, tinkering.
        const t = now * 9 + key.length;
        rig.armL.rotation.x = -1.1 + Math.sin(t) * 0.25;
        rig.armR.rotation.x = -1.1 + Math.sin(t + Math.PI) * 0.25;
      } else {
        rig.armL.rotation.x = -s * 0.8;
        rig.armR.rotation.x = s * 0.8;
      }
    };

    for (const s of state.staff) {
      // Away training: not in the building.
      if (s.trainingUntil !== null) continue;
      const working = s.task !== null && s.path.length === 0;
      const look = STAFF_LOOK[s.role] ?? STAFF_LOOK.technician!;
      // Account managers stand at their desk rather than tinkering with it.
      const busy = working && s.task?.kind !== 'desk';
      place(`s${s.id}`, () => {
        const rig = person(look.kind, `s${s.id}`, look.shirt);
        rig.group.userData.staffId = s.id;
        return rig;
      }, s.x, s.y, busy);
    }
    for (const c of state.clients) {
      if (state.tick < c.spawnTick) continue;
      const offer = state.contracts.offers.find((o) => o.id === c.offerId);
      const colour = CUSTOMER_TYPES.find((t) => t.id === offer?.customerType)?.color ?? 0x8a94a3;
      place(`c${c.id}`, () => person('client', `c${c.id}`, colour), c.x, c.y, false);
    }

    for (const [key, fig] of this.figures) {
      if (alive.has(key)) continue;
      this.group.remove(fig.rig.group);
      this.figures.delete(key);
    }
  }

  clear(): void {
    this.group.clear();
    this.figures.clear();
  }
}
