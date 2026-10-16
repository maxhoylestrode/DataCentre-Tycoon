// Guards the most important rule in PLAN.md: the sim must not depend on
// Three.js or the DOM.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const FORBIDDEN = [
  /from\s+['"]three/,
  /import\(\s*['"]three/,
  /\bdocument\./,
  /\bwindow\./,
  /from\s+['"]\.\.\/(render|input|ui)\//,
];

describe('architecture', () => {
  it('src/sim has no Three.js, DOM or renderer imports', () => {
    const files = [...listTsFiles('src/sim'), 'src/config.ts'];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });
});
