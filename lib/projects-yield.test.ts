import { describe, expect, it } from 'vitest';
import { formatYieldDesc } from '@/lib/projects';

describe('formatYieldDesc', () => {
  it('met l’unité après chaque dimension', () => {
    expect(formatYieldDesc('round', { diametre: 8, hauteur: 2 }, 6)).toBe('6 × Ø 8 cm × 2 cm');
    expect(formatYieldDesc('round', { diametre: 22, hauteur: 4 }, null)).toBe('Ø 22 cm × 4 cm');
  });
  it('ne rend rien sans dimension', () => {
    expect(formatYieldDesc('round', {}, 3)).toBeNull();
  });
});
