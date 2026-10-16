// Shared number formatting for the UI. Sim values are floats (upgrades
// multiply by 1.15 etc.), so never print them raw: 48.4999999 should read 48.5.

// Rounds to at most `decimals` places and drops trailing zeros: 48.5, 20, 6.4.
export function num(n: number, decimals = 1): string {
  return String(Number(n.toFixed(decimals)));
}

export function kw(n: number): string {
  return `${num(n)} kW`;
}
