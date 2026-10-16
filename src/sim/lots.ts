// Rooms (lots): which tiles you own, which lots you can buy next, and what
// they cost. Every edge between two lots is a permanent wall.

import { CONFIG } from '../config';
import { LOTS } from './content/lots';
import type { Lot } from './content/types';
import type { GameState } from './state';

const L = CONFIG.lots;

// The whole map, sized to fit every lot in content.
export const MAP_WIDTH = (Math.max(...LOTS.map((l) => l.col)) + 1) * L.width;
export const MAP_HEIGHT = (Math.max(...LOTS.map((l) => l.row)) + 1) * L.height;

// A grid smaller than one lot (as tests use) is treated as a single lot.
export function lotSize(state: GameState): { w: number; h: number } {
  return { w: Math.min(state.width, L.width), h: Math.min(state.height, L.height) };
}

export function lotAt(state: GameState, x: number, y: number): Lot | undefined {
  const { w, h } = lotSize(state);
  const col = Math.floor(x / w);
  const row = Math.floor(y / h);
  return LOTS.find((l) => l.col === col && l.row === row);
}

export function isOwnedTile(state: GameState, x: number, y: number): boolean {
  const lot = lotAt(state, x, y);
  return lot !== undefined && state.ownedLots.includes(lot.id);
}

export function roomsOwned(state: GameState): number {
  return state.ownedLots.length;
}

// Lots that fit on this map.
export function lotsOnMap(state: GameState): Lot[] {
  const { w, h } = lotSize(state);
  return LOTS.filter((l) => (l.col + 1) * w <= state.width && (l.row + 1) * h <= state.height);
}

// Lots you can buy now: not owned, and sharing a side with one you own.
export function purchasableLots(state: GameState): Lot[] {
  const owned = LOTS.filter((l) => state.ownedLots.includes(l.id));
  return lotsOnMap(state).filter(
    (l) =>
      !state.ownedLots.includes(l.id) &&
      owned.some((o) => Math.abs(o.col - l.col) + Math.abs(o.row - l.row) === 1),
  );
}

// Price of the next room, rising with each one bought.
export function nextLotPrice(state: GameState): number {
  const bought = Math.max(0, state.ownedLots.length - 1);
  const last = L.prices[L.prices.length - 1]!;
  return L.prices[bought] ?? last * 2 ** (bought - L.prices.length + 1);
}

// Whether two adjacent tiles are in different lots (so a permanent wall sits between).
export function isLotBoundary(state: GameState, x1: number, y1: number, x2: number, y2: number): boolean {
  const { w, h } = lotSize(state);
  return Math.floor(x1 / w) !== Math.floor(x2 / w) || Math.floor(y1 / h) !== Math.floor(y2 / h);
}
