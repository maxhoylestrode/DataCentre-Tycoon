// Numbers for the upgradable safety buildings. Each upgrade level multiplies
// a UPS bank's backup and a firewall's filtering by a growth factor.

import { buildingDef, CONFIG } from '../config';
import { type Building, type GameState, isRunning } from './state';

const S = CONFIG.safety;

// kW of backup this UPS bank gives in a power cut.
export function upsBackupKw(b: Building, level: number = b.upgrade): number {
  return (buildingDef(b.kind).backupKw ?? 0) * S.upsGrowth ** level;
}

// Mbps of attack traffic this firewall can filter.
export function firewallFilterMbps(b: Building, level: number = b.upgrade): number {
  return (buildingDef(b.kind).ddosFilterMbps ?? 0) * S.firewallGrowth ** level;
}

// Share of an attack this many Mbps in size that a single firewall blocks:
// its filtering over the attack size, but never more than firewallMaxShare.
export function firewallShare(b: Building, attackMbps: number, level: number = b.upgrade): number {
  if (attackMbps <= 0) return S.firewallMaxShare;
  return Math.min(S.firewallMaxShare, firewallFilterMbps(b, level) / attackMbps);
}

// Share of an attack all running firewalls block together, 0 to 1.
export function attackBlocked(state: GameState, attackMbps: number): number {
  const total = state.buildings.reduce(
    (sum, b) => sum + (isRunning(b) && buildingDef(b.kind).ddosFilterMbps ? firewallShare(b, attackMbps) : 0),
    0,
  );
  return Math.min(1, total);
}
