import * as THREE from 'three';
import { CONFIG } from '../config';
import { lotSize, nextLotPrice, purchasableLots } from '../sim/lots';
import type { GameState } from '../sim/state';
import { ICONS } from './icons';

export interface RoomsHandlers {
  onBuy(lotId: string): void;
}

const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;

// "Room for sale" labels floating over lots you can buy, and the
// confirmation shown before buying one.
export class RoomSale {
  private readonly labels = new Map<string, HTMLButtonElement>();
  private readonly layer: HTMLElement;
  private readonly dialog: HTMLElement;
  private pending: string | null = null;
  private readonly point = new THREE.Vector3();

  constructor(parent: HTMLElement, handlers: RoomsHandlers) {
    this.layer = document.createElement('div');
    this.layer.className = 'room-labels';
    parent.appendChild(this.layer);

    this.dialog = document.createElement('div');
    this.dialog.className = 'contracts room-dialog';
    parent.appendChild(this.dialog);
    this.dialog.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const act = (e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.act;
      if (act === 'buy' && this.pending) handlers.onBuy(this.pending);
      if (act) this.close();
    });
  }

  // Opens the confirmation for a lot (from a label or a click on its plate).
  ask(lotId: string): void {
    this.pending = lotId;
    this.dialog.classList.add('open');
  }

  close(): void {
    this.pending = null;
    this.dialog.classList.remove('open');
  }

  update(state: GameState, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    const price = nextLotPrice(state);
    const forSale = purchasableLots(state);
    const { w, h } = lotSize(state);
    const live = new Set<string>();

    for (const lot of forSale) {
      live.add(lot.id);
      let label = this.labels.get(lot.id);
      if (!label) {
        label = document.createElement('button');
        label.className = 'room-label';
        label.addEventListener('pointerdown', (e) => {
          if (e.button === 0) this.ask(lot.id);
        });
        this.layer.appendChild(label);
        this.labels.set(lot.id, label);
      }
      const html = `${ICONS.lock}<span><b>Room for sale</b><br>${money(price)}</span>`;
      if (label.innerHTML !== html) label.innerHTML = html;
      label.classList.toggle('short', state.cash < price);

      // Float the label above the padlock in the middle of the lot.
      this.point.set((lot.col + 0.5) * w - state.width / 2, 1.6, (lot.row + 0.5) * h - state.height / 2);
      this.point.project(camera);
      const visible = this.point.z < 1 && Math.abs(this.point.x) < 1.1 && Math.abs(this.point.y) < 1.1;
      label.style.display = visible ? '' : 'none';
      label.style.left = `${((this.point.x + 1) / 2) * canvas.clientWidth}px`;
      label.style.top = `${((1 - this.point.y) / 2) * canvas.clientHeight}px`;
    }
    for (const [id, label] of this.labels) {
      if (live.has(id)) continue;
      label.remove();
      this.labels.delete(id);
    }

    if (this.pending) {
      if (!forSale.some((l) => l.id === this.pending)) return this.close();
      const rent = CONFIG.economy.rentPerTick * CONFIG.economy.runningCostMultiplier;
      const short = state.cash < price;
      const html = `
        <div class="contracts-head"><h2>Buy this room?</h2><button data-act="cancel">✕</button></div>
        <p>A new ${w} × ${h} room next door, with a wall between. Put doors or glass in that wall to join them up (heat still won't pass).</p>
        <div class="capacity">Price <b>${money(price)}</b> &middot; rent +£${rent.toFixed(2)}/min</div>
        <p class="muted">Each room costs more than the last.</p>
        <button data-act="buy" class="primary" ${short ? 'disabled' : ''}>${short ? `Need ${money(price)}` : `Buy for ${money(price)}`}</button>
        <button data-act="cancel">Cancel</button>`;
      if (this.dialog.dataset.html !== html) {
        this.dialog.dataset.html = html;
        this.dialog.innerHTML = html;
      }
    }
  }
}
