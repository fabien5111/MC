// Ligature « œ » (JEP-282) : une liste fermée de mots, jamais tout « oe » — un
// « moelleux » réécrit « mœlleux » serait une faute introduite par le site.
import { describe, expect, it } from 'vitest';
import { fixOeufLigature } from '@/lib/text';

describe('fixOeufLigature', () => {
  it('corrige les mots de la liste, au singulier et au pluriel', () => {
    expect(fixOeufLigature('oeuf')).toBe('œuf');
    expect(fixOeufLigature('oeufs')).toBe('œufs');
    expect(fixOeufLigature("jaune d'oeuf")).toBe("jaune d'œuf");
    expect(fixOeufLigature('gélatine de boeuf')).toBe('gélatine de bœuf');
    expect(fixOeufLigature('cerises coeur de pigeon')).toBe('cerises cœur de pigeon');
    expect(fixOeufLigature('coeurs')).toBe('cœurs');
    expect(fixOeufLigature('oeillets comestibles')).toBe('œillets comestibles');
    expect(fixOeufLigature("huile d'oeillette")).toBe("huile d'œillette");
  });
  it('préserve la casse', () => {
    expect(fixOeufLigature('Oeuf')).toBe('Œuf');
    expect(fixOeufLigature('OEUFS')).toBe('ŒUFS');
    expect(fixOeufLigature('Boeuf')).toBe('Bœuf');
    expect(fixOeufLigature('BOEUF')).toBe('BŒUF');
    expect(fixOeufLigature('Coeur')).toBe('Cœur');
  });
  it('ne touche à aucun autre « oe »', () => {
    for (const mot of ['moelleux', 'coefficient', 'Noël', 'poêle', 'moelle', 'coexister', 'oenologie']) {
      expect(fixOeufLigature(mot)).toBe(mot);
    }
  });
  it('laisse intact un texte déjà correct ou vide', () => {
    expect(fixOeufLigature('Œuf')).toBe('Œuf');
    expect(fixOeufLigature('')).toBe('');
    expect(fixOeufLigature(null)).toBe('');
  });
});
