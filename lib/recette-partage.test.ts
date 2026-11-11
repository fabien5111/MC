import { describe, expect, it } from 'vitest';
import { DESCRIPTION_PARTAGE_DEFAUT, DESCRIPTION_PARTAGE_MAX, descriptionRecettePartage } from './recette-partage';

describe('descriptionRecettePartage', () => {
  it('rend le texte défaut quand la description est vide ou absente', () => {
    expect(descriptionRecettePartage(null)).toBe(DESCRIPTION_PARTAGE_DEFAUT);
    expect(descriptionRecettePartage('   \n ')).toBe(DESCRIPTION_PARTAGE_DEFAUT);
  });

  it('garde une description courte telle quelle, espaces normalisés', () => {
    expect(descriptionRecettePartage('  Une tarte\n  au citron  ')).toBe('Une tarte au citron');
  });

  it('coupe au mot près, avec « … », sans dépasser le plafond', () => {
    const long = 'Une ganache montée au chocolat noir, légère et aérienne, '.repeat(6);
    const r = descriptionRecettePartage(long);
    expect(r.length).toBeLessThanOrEqual(DESCRIPTION_PARTAGE_MAX);
    expect(r.endsWith('…')).toBe(true);
    expect(r).not.toMatch(/[,\s]…$/);
    expect(long.startsWith(r.slice(0, -1))).toBe(true);
  });

  it('coupe net un texte sans espace', () => {
    const r = descriptionRecettePartage('a'.repeat(300));
    expect(r.length).toBe(DESCRIPTION_PARTAGE_MAX);
    expect(r.endsWith('…')).toBe(true);
  });
});
