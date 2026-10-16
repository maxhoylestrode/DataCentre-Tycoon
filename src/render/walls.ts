import * as THREE from 'three';
import { CONFIG, type WallKind } from '../config';
import type { Edge } from '../input/walls';
import { LOTS } from '../sim/content/lots';
import { ROOM_STYLES } from '../sim/content/styles';
import { lotSize } from '../sim/lots';
import type { GameState } from '../sim/state';

const { low, full, thickness: T } = CONFIG.wallHeights;

// Plain walls follow the room's wall colour from the Style panel.
const basicMat = new THREE.MeshStandardMaterial({ color: 0x6d7682, roughness: 0.8 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 });
const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xbfe3ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3,
});
const glassFrameMat = new THREE.MeshStandardMaterial({ color: 0xaab4bf, metalness: 0.6, roughness: 0.3 });
const knobMat = new THREE.MeshStandardMaterial({ color: 0xd9c27a, metalness: 0.8, roughness: 0.3 });
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x4cc38a, transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0565b, transparent: true, opacity: 0.55, depthWrite: false });

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// A box spanning one edge, `height` tall. Slightly longer than a tile so
// neighbouring segments overlap at corners instead of leaving gaps.
function edgeBox(material: THREE.Material, height: number, thick: number = T): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(1 + T, height, thick);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Builds one wall segment as a group lying along +x; the caller rotates it
// for vertical edges.
function buildSegment(kind: WallKind, height: number): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'wall_basic') {
    group.add(edgeBox(basicMat, height));
  } else if (kind === 'wall_glass') {
    group.add(edgeBox(glassMat, height, T * 0.5));
    const top = edgeBox(glassFrameMat, 0.05, T);
    top.position.y = height - 0.025;
    const bottom = edgeBox(glassFrameMat, 0.06, T);
    bottom.position.y = 0.03;
    group.add(top, bottom);
  } else {
    // A door: wooden leaf in a dark frame, with a brass knob.
    const doorHeight = Math.min(height, 2.05);
    group.add(edgeBox(doorFrameMat, height, T * 0.6));
    const leaf = new THREE.Mesh(unitBox, doorMat);
    leaf.scale.set(0.82, doorHeight - 0.04, T * 1.2);
    leaf.position.y = (doorHeight - 0.04) / 2;
    leaf.castShadow = true;
    group.add(leaf);
    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), knobMat);
      knob.position.set(0.3, Math.min(doorHeight * 0.48, 1), side * T * 0.8);
      group.add(knob);
    }
  }
  return group;
}

// Positions a group on an edge, in world space.
function placeOnEdge(group: THREE.Object3D, edge: Edge, w: number, h: number): void {
  if (edge.dir === 'h') {
    group.position.set(edge.x + 0.5 - w / 2, 0, edge.y - h / 2);
    group.rotation.y = 0;
  } else {
    group.position.set(edge.x - w / 2, 0, edge.y + 0.5 - h / 2);
    group.rotation.y = Math.PI / 2;
  }
}

const keyOf = (e: Edge): string => `${e.x},${e.y},${e.dir}`;

// Every tile edge on the wall between two owned rooms.
function roomBoundaryEdges(state: GameState): Edge[] {
  const { w, h } = lotSize(state);
  const owned = LOTS.filter((l) => state.ownedLots.includes(l.id));
  const has = (col: number, row: number): boolean => owned.some((l) => l.col === col && l.row === row);
  const edges: Edge[] = [];
  for (const lot of owned) {
    if (has(lot.col + 1, lot.row)) {
      for (let y = lot.row * h; y < (lot.row + 1) * h; y++) edges.push({ x: (lot.col + 1) * w, y, dir: 'v' });
    }
    if (has(lot.col, lot.row + 1)) {
      for (let x = lot.col * w; x < (lot.col + 1) * w; x++) edges.push({ x, y: (lot.row + 1) * h, dir: 'h' });
    }
  }
  return edges;
}

// Interior walls, plus a ghost preview while the player is drawing them.
export class WallLayer {
  readonly group = new THREE.Group();
  private readonly segments = new Map<string, { kind: WallKind; height: number; mesh: THREE.Group }>();
  private readonly ghosts = new THREE.Group();
  private fullHeight = false;
  private wallStyle = '';
  private ghostKey = '';

  constructor() {
    this.group.add(this.ghosts);
  }

  get tall(): boolean {
    return this.fullHeight;
  }

  set tall(on: boolean) {
    this.fullHeight = on;
  }

  sync(state: GameState): void {
    if (state.style.wall !== this.wallStyle) {
      this.wallStyle = state.style.wall;
      const style = ROOM_STYLES.find((s) => s.id === state.style.wall);
      if (style) basicMat.color.setHex(style.color);
    }

    const height = this.fullHeight ? full : low;
    const alive = new Set<string>();
    // Walls between two owned rooms are plain walls unless the player has put
    // a door or glass there.
    const walls: { kind: WallKind; x: number; y: number; dir: 'h' | 'v' }[] = [...state.walls];
    const placed = new Set(state.walls.map(keyOf));
    for (const edge of roomBoundaryEdges(state)) {
      if (!placed.has(keyOf(edge))) walls.push({ ...edge, kind: 'wall_basic' });
    }
    for (const wall of walls) {
      const key = keyOf(wall);
      alive.add(key);
      const existing = this.segments.get(key);
      if (existing && existing.kind === wall.kind && existing.height === height) continue;
      if (existing) this.group.remove(existing.mesh);
      const mesh = buildSegment(wall.kind, height);
      placeOnEdge(mesh, wall, state.width, state.height);
      this.group.add(mesh);
      this.segments.set(key, { kind: wall.kind, height, mesh });
    }
    for (const [key, seg] of this.segments) {
      if (alive.has(key)) continue;
      this.group.remove(seg.mesh);
      this.segments.delete(key);
    }
  }

  // Shows translucent segments where a wall would go: green if it can be
  // built, red if not (or when previewing a removal).
  showGhost(edges: { edge: Edge; ok: boolean }[], state: GameState): void {
    const key = `${this.fullHeight}|${edges.map((e) => `${keyOf(e.edge)}:${e.ok}`).join(';')}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghosts.clear();
    for (const { edge, ok } of edges) {
      const mesh = new THREE.Mesh(unitBox, ok ? ghostOk : ghostBad);
      mesh.scale.set(1 + T, (this.fullHeight ? full : low) + 0.02, T * 1.6);
      mesh.position.y = mesh.scale.y / 2;
      const holder = new THREE.Group();
      holder.add(mesh);
      placeOnEdge(holder, edge, state.width, state.height);
      this.ghosts.add(holder);
    }
  }

  clear(): void {
    for (const seg of this.segments.values()) this.group.remove(seg.mesh);
    this.segments.clear();
    this.ghosts.clear();
    this.ghostKey = '';
  }
}
