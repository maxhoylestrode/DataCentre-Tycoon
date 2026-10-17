import * as THREE from 'three';
import type { ZoneKind } from '../config';
import type { GameState } from '../sim/state';

export const ZONE_COLOURS: Record<ZoneKind, number> = {
  server: 0x4aa8ff,
  staff: 0x4cc38a,
  storage: 0xffb347,
};

const tileGeo = new THREE.PlaneGeometry(0.98, 0.98);
const mats = Object.fromEntries(
  Object.entries(ZONE_COLOURS).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, depthWrite: false })]),
) as Record<ZoneKind, THREE.MeshBasicMaterial>;

// Coloured floor tint for zones. Faint normally, stronger while a zone tool
// is selected.
export class ZoneLayer {
  readonly group = new THREE.Group();
  private key = '';

  sync(state: GameState, emphasised: boolean): void {
    for (const m of Object.values(mats)) m.opacity = emphasised ? 0.38 : 0.16;
    const key = state.zones.map((z) => `${z.kind}${z.x},${z.y}`).join(';');
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    for (const z of state.zones) {
      const mesh = new THREE.Mesh(tileGeo, mats[z.kind]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(z.x + 0.5 - state.width / 2, 0.0016, z.y + 0.5 - state.height / 2);
      this.group.add(mesh);
    }
  }

  clear(): void {
    this.group.clear();
    this.key = '';
  }
}

const previewMats = new Map<string, THREE.MeshBasicMaterial>();

// The rectangle being dragged with a zone tool (null kind = clearing).
export class ZonePreview {
  readonly mesh: THREE.Mesh;

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
  }

  show(state: GameState, rect: { x0: number; y0: number; x1: number; y1: number } | null, kind: ZoneKind | null): void {
    this.showBox(state, rect, kind ? ZONE_COLOURS[kind] : 0xe0565b);
  }

  // Any dragged box (bulk place, sell or select), in the given colour.
  showBox(state: GameState, rect: { x0: number; y0: number; x1: number; y1: number } | null, colour: number): void {
    this.mesh.visible = rect !== null;
    if (!rect) return;
    let m = previewMats.get(String(colour));
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, depthWrite: false });
      previewMats.set(String(colour), m);
    }
    this.mesh.material = m;
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    this.mesh.scale.set(w, h, 1);
    this.mesh.position.set(rect.x0 + w / 2 - state.width / 2, 0.005, rect.y0 + h / 2 - state.height / 2);
  }
}
