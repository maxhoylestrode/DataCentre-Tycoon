import * as THREE from 'three';
import { CONFIG } from '../config';

const DISTANCE = 50;

// Orthographic camera at a fixed steep angle that orbits a target point on
// the floor. Panning moves the target; zooming changes camera.zoom.
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  private readonly offset: THREE.Vector3;
  private readonly pitch: number;
  private readonly bounds: { halfWidth: number; halfDepth: number };

  constructor(aspect: number, gridWidth: number, gridHeight: number) {
    const half = CONFIG.camera.viewHeight / 2;
    this.camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 200);

    this.pitch = THREE.MathUtils.degToRad(CONFIG.camera.pitchDeg);
    const yaw = THREE.MathUtils.degToRad(CONFIG.camera.yawDeg);
    const flat = Math.cos(this.pitch) * DISTANCE;
    this.offset = new THREE.Vector3(Math.sin(yaw) * flat, Math.sin(this.pitch) * DISTANCE, Math.cos(yaw) * flat);

    this.bounds = { halfWidth: gridWidth / 2, halfDepth: gridHeight / 2 };
    this.update();
  }

  resize(aspect: number): void {
    const half = CONFIG.camera.viewHeight / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  // Points the camera at a spot on the floor (world x, z).
  focus(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.update();
  }

  zoomBy(factor: number): void {
    const { minZoom, maxZoom } = CONFIG.camera;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, minZoom, maxZoom);
    this.camera.updateProjectionMatrix();
  }

  // Drag panning: the floor follows the cursor.
  panByPixels(dx: number, dy: number, viewportHeightPx: number): void {
    const worldPerPx = CONFIG.camera.viewHeight / this.camera.zoom / viewportHeightPx;
    // A vertical screen pixel covers more floor because the view is tilted.
    this.pan(-dx * worldPerPx, dy * worldPerPx / Math.sin(this.pitch));
  }

  // Positive right moves the view right, positive forward moves it up the screen.
  pan(right: number, forward: number): void {
    const { right: r, forward: f } = this.groundAxes();
    this.target.addScaledVector(r, right).addScaledVector(f, forward);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.bounds.halfWidth, this.bounds.halfWidth);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -this.bounds.halfDepth, this.bounds.halfDepth);
    this.update();
  }

  private groundAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
    const forward = new THREE.Vector3(-this.offset.x, 0, -this.offset.z).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { right, forward };
  }

  private update(): void {
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
