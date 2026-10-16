import { describe, expect, it } from 'vitest';
import { kw, num } from '../src/ui/format';

// The UI formatter has no DOM dependency, so it can be tested headless too.
describe('number formatting', () => {
  it('hides float noise from upgrade multipliers', () => {
    expect(num(48.49999999999)).toBe('48.5');
    expect(num(20 * 1.15 * 3)).toBe('69');
    expect(kw(0.1 + 0.2)).toBe('0.3 kW');
  });

  it('drops trailing zeros and keeps whole numbers whole', () => {
    expect(kw(20)).toBe('20 kW');
    expect(num(6.4)).toBe('6.4');
    expect(num(0.6499, 2)).toBe('0.65');
  });
});
