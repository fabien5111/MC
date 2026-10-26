import { describe, expect, it } from 'vitest';
import { nombreIndisponibles } from '@/lib/recipe-lists';

describe('listes de recettes', () => {
  it('compte les recettes de la liste que la lecture n’a pas rendues', () => {
    expect(nombreIndisponibles(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(nombreIndisponibles(['a'], ['a', 'z'])).toBe(0);
    expect(nombreIndisponibles([], [])).toBe(0);
  });
});
