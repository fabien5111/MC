import { describe, expect, it } from 'vitest';
import { extraireCles } from './jira-cles.mjs';

describe('extraireCles', () => {
  it('trouve les clés du projet dans un texte libre', () => {
    expect(extraireCles('MC-123 — corrige le bandeau (voir MC-98)', 'MC')).toEqual(['MC-123', 'MC-98']);
  });

  it('dédoublonne en gardant l’ordre d’apparition', () => {
    expect(extraireCles('MC-12 puis MC-7 puis MC-12', 'MC')).toEqual(['MC-12', 'MC-7']);
  });

  it('ignore les minuscules, que Jira ne reconnaît pas', () => {
    expect(extraireCles('branche claude/mc-123-bandeau', 'MC')).toEqual([]);
  });

  it('n’attrape pas une clé d’un autre projet ni un préfixe accolé', () => {
    expect(extraireCles('AMC-123 et XX-4', 'MC')).toEqual([]);
  });

  it('ne confond pas une norme avec une clé', () => {
    expect(extraireCles('encodage UTF-8, hachage SHA-256', 'UTF')).toEqual(['UTF-8']);
    expect(extraireCles('encodage UTF-8', 'MC')).toEqual([]);
  });

  it('rend une liste vide sur un texte absent, et refuse un préfixe absent ou invalide', () => {
    expect(extraireCles('', 'MC')).toEqual([]);
    expect(extraireCles(null, 'MC')).toEqual([]);
    expect(() => extraireCles('MC-1', '')).toThrow(/manquant/);
    expect(() => extraireCles('MC-1', 'mc')).toThrow(/invalide/);
  });
});
