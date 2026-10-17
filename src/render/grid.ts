import * as THREE from 'three';
import type { ToolAction } from '../input/tools';
import { lotSize, lotsOnMap, purchasableLots } from '../sim/lots';
import type { GameState } from '../sim/state';

export interface Tile {
  x: number;
  y: number;
}

// Sim tile (x, y) maps to world (x, z), with the grid centred on the origin.
export function tileToWorld(gridWidth: number, gridHeight: number, x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x + 0.5 - gridWidth / 2, 0, y + 0.5 - gridHeight / 2);
}

export function worldToTile(gridWidth: number, gridHeight: number, point: THREE.Vector3): Tile | null {
  const x = Math.floor(point.x + gridWidth / 2);
  const y = Math.floor(point.z + gridHeight / 2);
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return null;
  return { x, y };
}

const gridMat = new THREE.LineBasicMaterial({ color: 0x8a919b, transparent: true, opacity: 0.6 });
const lockedMat = new THREE.MeshStandardMaterial({ color: 0x1e2229, roughness: 1 });
const forSaleMat = new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 1 });
const forSaleEdgeMat = new THREE.LineDashedMaterial({ color: 0x4aa8ff, dashSize: 0.6, gapSize: 0.4 });
const padlockMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, metalness: 0.5, roughness: 0.35 });

// Grid lines over the rooms you own, and plates over locked rooms: lots
// for sale (next to an owned room) get a dashed outline and a padlock.
// Rebuilt whenever a room is bought.
export class LotsLayer {
  readonly group = new THREE.Group();
  private key = '';

  update(state: GameState): void {
    const key = state.ownedLots.join(',');
    if (key === this.key) return;
    this.key = key;
    this.group.clear();

    const { w: lw, h: lh } = lotSize(state);
    const forSale = new Set(purchasableLots(state).map((l) => l.id));
    for (const lot of lotsOnMap(state)) {
      const x0 = lot.col * lw - state.width / 2;
      const z0 = lot.row * lh - state.height / 2;
      if (state.ownedLots.includes(lot.id)) {
        this.group.add(gridLines(x0, z0, lw, lh));
        continue;
      }
      const sale = forSale.has(lot.id);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.3, 0.1, lh - 0.3), sale ? forSaleMat : lockedMat);
      plate.position.set(x0 + lw / 2, -0.25, z0 + lh / 2);
      plate.receiveShadow = true;
      this.group.add(plate);
      if (!sale) continue;

      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x0 + 0.4, -0.19, z0 + 0.4),
          new THREE.Vector3(x0 + lw - 0.4, -0.19, z0 + 0.4),
          new THREE.Vector3(x0 + lw - 0.4, -0.19, z0 + lh - 0.4),
          new THREE.Vector3(x0 + 0.4, -0.19, z0 + lh - 0.4),
        ]),
        forSaleEdgeMat,
      );
      outline.computeLineDistances();
      this.group.add(outline);
      this.group.add(padlock(x0 + lw / 2, z0 + lh / 2));
    }
  }
}

function gridLines(x0: number, z0: number, w: number, h: number): THREE.LineSegments {
  const points: number[] = [];
  for (let i = 0; i <= w; i++) points.push(x0 + i, 0, z0, x0 + i, 0, z0 + h);
  for (let j = 0; j <= h; j++) points.push(x0, 0, z0 + j, x0 + w, 0, z0 + j);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, gridMat);
  lines.position.y = 0.002;
  return lines;
}

// A chunky gold padlock standing in the middle of a room for sale.
function padlock(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.5), padlockMat);
  body.position.y = 0.3;
  body.castShadow = true;
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 20, Math.PI), padlockMat);
  shackle.position.y = 0.8;
  shackle.castShadow = true;
  group.add(body, shackle);
  group.position.set(x, 0, z);
  return group;
}

const HOVER_COLOURS: Record<ToolAction, number> = {
  place: 0x4cc38a,
  sell: 0xe0565b,
  repair: 0x4f9cf0,
  inspect: 0xb28cff,
  blocked: 0x7d838c,
  // Wall tools show a ghost wall instead of a tile highlight.
  draw: 0x4cc38a,
};

export class HoverHighlight {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly gridWidth: number, private readonly gridHeight: number) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.96),
      new THREE.MeshBasicMaterial({ color: HOVER_COLOURS.place, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.004;
    this.mesh.visible = false;
  }

  set(tile: Tile | null, mode: ToolAction): void {
    this.mesh.visible = tile !== null;
    if (!tile) return;
    const p = tileToWorld(this.gridWidth, this.gridHeight, tile.x, tile.y);
    this.mesh.position.x = p.x;
    this.mesh.position.z = p.z;
    this.mesh.material.color.setHex(HOVER_COLOURS[mode]);
  }
}

// Turns a screen position into the tile under it, or null if off the grid.
export class TilePicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly gridWidth: number,
    private readonly gridHeight: number,
  ) {}

  pick(clientX: number, clientY: number): Tile | null {
    const grid = this.pickGrid(clientX, clientY);
    if (!grid) return null;
    return worldToTile(this.gridWidth, this.gridHeight, this.hit);
  }

  // The first of these objects under the cursor, if any (e.g. alert badges).
  pickObject(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Object3D | null {
    if (objects.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObjects(objects, false)[0]?.object ?? null;
  }

  // The floor point under the cursor in grid coordinates (room corner at
  // 0, 0; one unit per tile), not clamped to the room. Used to draw walls.
  pickGrid(clientX: number, clientY: number): { gx: number; gy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hit)) return null;
    return { gx: this.hit.x + this.gridWidth / 2, gy: this.hit.z + this.gridHeight / 2 };
  }
}
