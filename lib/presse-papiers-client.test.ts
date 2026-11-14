import { describe, expect, it } from 'vitest';
import { boutonCollerVisible, nomImageCollee } from '@/lib/presse-papiers-client';

describe('nomImageCollee', () => {
  it('donne un nom et une extension à une capture sans nom', () => {
    expect(nomImageCollee('image/png', 1)).toBe('image-collee-1.png');
    expect(nomImageCollee('image/jpeg', 2)).toBe('image-collee-2.jpg');
    expect(nomImageCollee('image/webp', 3)).toBe('image-collee-3.webp');
  });
  it('retombe sur png quand le type est illisible', () => {
    expect(nomImageCollee('image/', 1)).toBe('image-collee-1.png');
    expect(nomImageCollee('image/svg+xml', 1)).toBe('image-collee-1.svgxml');
  });
});

describe('boutonCollerVisible', () => {
  it("se montre quand l'état est inconnu ou qu'une image est copiée", () => {
    expect(boutonCollerVisible('inconnu')).toBe(true);
    expect(boutonCollerVisible('image')).toBe(true);
  });
  it('se cache quand le presse-papiers est vide ou illisible', () => {
    expect(boutonCollerVisible('vide')).toBe(false);
    expect(boutonCollerVisible('indisponible')).toBe(false);
  });
});
