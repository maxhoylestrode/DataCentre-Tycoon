import * as THREE from 'three';
import type { ToolAction } from '../input/tools';

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

export function createGridLines(gridWidth: number, gridHeight: number): THREE.LineSegments {
  const points: number[] = [];
  const hw = gridWidth / 2;
  const hh = gridHeight / 2;
  for (let i = 0; i <= gridWidth; i++) points.push(i - hw, 0, -hh, i - hw, 0, hh);
  for (let j = 0; j <= gridHeight; j++) points.push(-hw, 0, j - hh, hw, 0, j - hh);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x8a919b, transparent: true, opacity: 0.6 }),
  );
  lines.position.y = 0.002;
  return lines;
}

const HOVER_COLOURS: Record<ToolAction, number> = {
  place: 0x4cc38a,
  sell: 0xe0565b,
  repair: 0x4f9cf0,
  blocked: 0x7d838c,
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
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hit)) return null;
    return worldToTile(this.gridWidth, this.gridHeight, this.hit);
  }
}
