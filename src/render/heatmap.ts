import * as THREE from 'three';
import { CONFIG } from '../config';
import { isOwnedTile } from '../sim/lots';
import type { GameState } from '../sim/state';

const H = CONFIG.heat;

// Colour stops by how far a tile is from ambient (0) to failTemp (1).
const STOPS: Array<[number, THREE.Color]> = [
  [0, new THREE.Color(0x2a6cff)],
  [(H.warnTemp - H.ambient) / (H.failTemp - H.ambient) - 0.15, new THREE.Color(0x3fcf6a)],
  [(H.warnTemp - H.ambient) / (H.failTemp - H.ambient), new THREE.Color(0xffd23a)],
  [1, new THREE.Color(0xff2a2a)],
];

function heatColour(u: number, out: THREE.Color): THREE.Color {
  for (let i = 1; i < STOPS.length; i++) {
    const [u1, c1] = STOPS[i]!;
    const [u0, c0] = STOPS[i - 1]!;
    if (u <= u1) return out.copy(c0).lerp(c1, (u - u0) / (u1 - u0));
  }
  return out.copy(STOPS[STOPS.length - 1]![1]);
}

// A texture with one pixel per tile, stretched over the floor. Reads state only.
export class HeatOverlay {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly data: Uint8Array<ArrayBuffer>;
  private readonly texture: THREE.DataTexture;
  private readonly colour = new THREE.Color();

  constructor(private readonly width: number, private readonly height: number) {
    this.data = new Uint8Array(width * height * 4);
    this.texture = new THREE.DataTexture(this.data, width, height, THREE.RGBAFormat);
    // Smooth blend between tiles. Data is written as linear colour, the
    // texture's default colour space, so no conversion is needed.
    this.texture.magFilter = THREE.LinearFilter;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.003;
    this.mesh.visible = false;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(state: GameState): void {
    if (!this.mesh.visible) return;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = state.temps[y * this.width + x] ?? H.ambient;
        const u = Math.min(1, Math.max(0, (t - H.ambient) / (H.failTemp - H.ambient)));
        heatColour(u, this.colour);
        // Texture row 0 is the plane's bottom edge, which is the far end (tile y = height - 1)
        // after rotating the plane flat.
        const i = ((this.height - 1 - y) * this.width + x) * 4;
        this.data[i] = this.colour.r * 255;
        this.data[i + 1] = this.colour.g * 255;
        this.data[i + 2] = this.colour.b * 255;
        // Rooms you don't own stay uncoloured.
        this.data[i + 3] = isOwnedTile(state, x, y) ? (0.25 + 0.5 * u) * 255 : 0;
      }
    }
    this.texture.needsUpdate = true;
  }
}
