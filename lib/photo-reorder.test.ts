import { describe, expect, it } from 'vitest';
import { destinationInsertion, moveAt, zoneDepot } from '@/lib/photo-reorder';

describe('zoneDepot (JEP-434)', () => {
  it('bords = gouttière, centre = échange', () => {
    expect(zoneDepot(10, 100)).toBe('avant');
    expect(zoneDepot(50, 100)).toBe('centre');
    expect(zoneDepot(90, 100)).toBe('apres');
  });
  it('largeur nulle : échange', () => {
    expect(zoneDepot(5, 0)).toBe('centre');
  });
});

describe('destinationInsertion', () => {
  const abcd = ['a', 'b', 'c', 'd'];
  it('avant une photo située plus loin', () => {
    // a devant d : b, c, a, d
    expect(moveAt(abcd, 0, destinationInsertion(0, 3, 'avant'))).toEqual(['b', 'c', 'a', 'd']);
  });
  it('après une photo située plus loin', () => {
    expect(moveAt(abcd, 0, destinationInsertion(0, 3, 'apres'))).toEqual(['b', 'c', 'd', 'a']);
  });
  it('vers le début ou en arrière', () => {
    expect(moveAt(abcd, 3, destinationInsertion(3, 0, 'avant'))).toEqual(['d', 'a', 'b', 'c']);
    expect(moveAt(abcd, 3, destinationInsertion(3, 1, 'apres'))).toEqual(['a', 'b', 'd', 'c']);
  });
  it('juste à côté de soi : aucun changement', () => {
    expect(destinationInsertion(1, 0, 'apres')).toBe(1);
    expect(destinationInsertion(1, 2, 'avant')).toBe(1);
  });
});
