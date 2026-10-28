import { describe, expect, it } from 'vitest';
import { resumeAide, statutsAide } from './help-statut';

const pages = [
  { slug: 'creer', keys: ['creer.intro', 'creer.taille'] },
  { slug: 'fournee', keys: ['fournee.lancer'] },
];

describe('statutsAide', () => {
  it('active quand rien n’est masqué', () => {
    expect(statutsAide(pages, [])).toEqual({ creer: 'active', fournee: 'active' });
  });
  it('inactive quand la page entière est masquée, même avec des blocs masqués', () => {
    const s = statutsAide(pages, [
      { kind: 'page', target: 'creer' },
      { kind: 'block', target: 'creer.intro' },
    ]);
    expect(s.creer).toBe('inactive');
    expect(s.fournee).toBe('active');
  });
  it('partielle quand un bloc ou une vidéo est masqué', () => {
    expect(statutsAide(pages, [{ kind: 'block', target: 'creer.taille' }]).creer).toBe('partielle');
    expect(statutsAide(pages, [{ kind: 'video', target: 'fournee.lancer' }]).fournee).toBe('partielle');
  });
  it('ignore le masquage d’un bloc d’une autre page', () => {
    expect(statutsAide(pages, [{ kind: 'block', target: 'fournee.lancer' }]).creer).toBe('active');
  });
});

describe('resumeAide', () => {
  it('global active / inactive / mixte', () => {
    expect(resumeAide({ a: 'active', b: 'active' }).global).toBe('active');
    expect(resumeAide({ a: 'inactive', b: 'inactive' }).global).toBe('inactive');
    expect(resumeAide({ a: 'active', b: 'inactive' }).global).toBe('mixte');
    expect(resumeAide({ a: 'active', b: 'partielle' }).global).toBe('mixte');
    expect(resumeAide({ a: 'partielle', b: 'partielle' })).toMatchObject({ partielles: 2, global: 'mixte' });
  });
});
