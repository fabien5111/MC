// Les deux fonctions pures de `scripts/jira.mjs` — le reste du script est du
// réseau et de l'affichage. `texteVersAdf` y est une réécriture en JS de
// celle de `lib/jira.ts` (le script ne peut pas importer du TypeScript) :
// c'est justement ce qui justifie de la tester ici aussi, sinon les deux
// versions divergeraient sans que rien ne le signale.
import { describe, expect, it } from 'vitest';
import { adfVersTexte, texteVersAdf } from './jira.mjs';

describe('adfVersTexte', () => {
  it('aplatit paragraphes, sauts de ligne et listes', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Première ligne' }, { type: 'hardBreak' }, { type: 'text', text: 'suite' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'deux' }] }] },
          ],
        },
      ],
    };
    expect(adfVersTexte(doc).trim()).toBe('Première ligne\nsuite\n\n- un\n- deux');
  });

  it('rend une description absente comme une chaîne vide', () => {
    expect(adfVersTexte(null)).toBe('');
    expect(adfVersTexte(undefined)).toBe('');
  });

  it('traverse un nœud inconnu au lieu de perdre son contenu', () => {
    const doc = { type: 'expand', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'caché' }] }] };
    expect(adfVersTexte(doc).trim()).toBe('caché');
  });

  it('signale une pièce jointe plutôt que de la taire', () => {
    expect(adfVersTexte({ type: 'media', attrs: { id: 'x' } })).toBe('[pièce jointe]');
  });
});

describe('texteVersAdf', () => {
  it('sépare les paragraphes sur les lignes vides et pose un hardBreak sinon', () => {
    expect(texteVersAdf('a\nb\n\nc')).toEqual({
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
      ],
    });
  });

  it('ne produit jamais un content vide, que Jira refuserait', () => {
    expect(texteVersAdf('').content).toHaveLength(1);
    expect(texteVersAdf('\n\n').content[0].content[0].text).toBe('—');
  });
});
