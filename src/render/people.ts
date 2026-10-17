import * as THREE from 'three';
import { CUSTOMER_TYPES } from '../sim/content/customers';
import type { GameState } from '../sim/state';

// Little low-poly people: a body, a head and a hat or hair. Staff wear hard
// hats (engineers, orange) or caps (technicians, blue); clients wear their
// company's colour. Positions glide towards the sim's so movement is smooth.

const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.8 });
const trousers = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
const bodyGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.42, 10);
const legsGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8);
const headGeo = new THREE.SphereGeometry(0.1, 12, 10);
const hatGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.07, 12);
const brimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.015, 14);

const matCache = new Map<number, THREE.MeshStandardMaterial>();
const colourMat = (c: number): THREE.MeshStandardMaterial => {
  let m = matCache.get(c);
  if (!m) matCache.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })));
  return m;
};

function person(shirt: number, hat: number | null): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(legsGeo, trousers);
  legs.position.y = 0.15;
  const body = new THREE.Mesh(bodyGeo, colourMat(shirt));
  body.position.y = 0.51;
  const head = new THREE.Mesh(headGeo, skin);
  head.position.y = 0.82;
  for (const m of [legs, body, head]) m.castShadow = true;
  g.add(legs, body, head);
  if (hat !== null) {
    const top = new THREE.Mesh(hatGeo, colourMat(hat));
    top.position.y = 0.9;
    const brim = new THREE.Mesh(brimGeo, colourMat(hat));
    brim.position.y = 0.87;
    g.add(top, brim);
  }
  return g;
}

interface Figure {
  group: THREE.Group;
  target: THREE.Vector3;
}

export class PeopleLayer {
  readonly group = new THREE.Group();
  private readonly figures = new Map<string, Figure>();

  sync(state: GameState, dt: number): void {
    const alive = new Set<string>();
    const place = (key: string, make: () => THREE.Group, x: number, y: number): void => {
      alive.add(key);
      let fig = this.figures.get(key);
      const target = new THREE.Vector3(x + 0.5 - state.width / 2, 0, y + 0.5 - state.height / 2);
      if (!fig) {
        fig = { group: make(), target };
        fig.group.position.copy(target);
        this.figures.set(key, fig);
        this.group.add(fig.group);
      }
      fig.target.copy(target);
      // Glide towards the sim position and face the way they're walking.
      const delta = fig.target.clone().sub(fig.group.position);
      if (delta.lengthSq() > 0.0004) fig.group.rotation.y = Math.atan2(delta.x, delta.z);
      fig.group.position.lerp(fig.target, Math.min(1, dt * 12));
      // A little bob while moving.
      fig.group.position.y = delta.lengthSq() > 0.0004 ? Math.abs(Math.sin(performance.now() / 90)) * 0.03 : 0;
    };

    for (const s of state.staff) {
      const shirt = s.role === 'engineer' ? 0x3a4a5a : 0x2f5f8f;
      const hat = s.role === 'engineer' ? 0xffb347 : 0x4aa8ff;
      place(`s${s.id}`, () => person(shirt, hat), s.x, s.y);
    }
    for (const c of state.clients) {
      if (state.tick < c.spawnTick) continue;
      const offer = state.contracts.offers.find((o) => o.id === c.offerId);
      const colour = CUSTOMER_TYPES.find((t) => t.id === offer?.customerType)?.color ?? 0x8a94a3;
      place(`c${c.id}`, () => person(colour, null), c.x, c.y);
    }

    for (const [key, fig] of this.figures) {
      if (alive.has(key)) continue;
      this.group.remove(fig.group);
      this.figures.delete(key);
    }
  }

  clear(): void {
    this.group.clear();
    this.figures.clear();
  }
}
