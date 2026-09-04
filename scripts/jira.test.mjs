// Les deux fonctions pures de `scripts/jira.mjs` — le reste du script est du
// réseau et de l'affichage. `texteVersAdf` y est une réécriture en JS de
// celle de `lib/jira.ts` (le script ne peut pas importer du TypeScript) :
// c'est justement ce qui justifie de la tester ici aussi, sinon les deux
// versions divergeraient sans que rien ne le signale.
import { describe, expect, it } from 'vitest';
import { adfVersTexte, resoudreTransition, texteVersAdf } from './jira.mjs';

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

describe('resoudreTransition', () => {
  const DEPLOYE_ID = '10002';
  const DEPLOYE_NOM = 'Déployé';
  const transitions = [
    { id: '11', name: 'Rouvrir', to: { id: '10000', name: 'À faire' } },
    { id: '21', name: 'Commencer', to: { id: '10001', name: 'En cours' } },
    { id: '31', name: 'Déployer', to: { id: DEPLOYE_ID, name: DEPLOYE_NOM } },
  ];

  it('retient la transition qui mène au statut visé', () => {
    const decision = resoudreTransition(transitions, null, 'En cours', DEPLOYE_ID, DEPLOYE_NOM);
    expect(decision.action).toBe('transitionner');
    expect(decision.transition.id).toBe('21');
  });

  it('rend « introuvable » plutôt qu’une transition au hasard', () => {
    expect(resoudreTransition([transitions[0]], null, 'En cours', DEPLOYE_ID, DEPLOYE_NOM).action).toBe('introuvable');
    expect(resoudreTransition(undefined, null, 'En cours', DEPLOYE_ID, DEPLOYE_NOM).action).toBe('introuvable');
  });

  // Le garde-fou : même si la cible demandée correspond, par erreur de
  // configuration, au statut « Déployé », la transition n'est jamais rendue
  // utilisable — c'est ce qui empêche ces verbes de déclencher l'e-mail
  // irréversible au demandeur (docs/contact-jira.md §2).
  it('refuse toute transition qui mènerait au statut Déployé, même si elle correspond à la cible demandée', () => {
    const decision = resoudreTransition(transitions, DEPLOYE_ID, DEPLOYE_NOM, DEPLOYE_ID, DEPLOYE_NOM);
    expect(decision.action).toBe('refuse_deploiement');
    expect(decision.transition.id).toBe('31');
  });

  it('reconnaît le statut par id en priorité, ce qui survit à un renommage', () => {
    const decision = resoudreTransition(transitions, '10001', 'Peu importe', DEPLOYE_ID, DEPLOYE_NOM);
    expect(decision.action).toBe('transitionner');
    expect(decision.transition.id).toBe('21');
  });
});
