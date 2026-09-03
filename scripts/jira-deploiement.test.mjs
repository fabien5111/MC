// Les deux fonctions pures du passage en « Déployé ». Elles portent la
// garantie qui compte : un ticket qui n'était pas prêt n'est jamais poussé
// en production côté Jira, donc aucun e-mail irréversible n'est envoyé à un
// demandeur pour une correction qui n'est pas en ligne.
import { describe, expect, it } from 'vitest';
import { choisirTransition, decisionDeploiement } from './jira-deploiement.mjs';

const STATUTS = { aDeployerId: null, aDeployerNom: 'Terminé', deployeId: null, deployeNom: 'Déployé' };
const STATUTS_ID = { aDeployerId: '10001', aDeployerNom: 'Terminé', deployeId: '10002', deployeNom: 'Déployé' };

describe('decisionDeploiement', () => {
  it('transitionne un ticket développé mais pas encore en ligne', () => {
    expect(decisionDeploiement({ name: 'Terminé' }, STATUTS).action).toBe('transitionner');
  });

  it('laisse tranquille un ticket déjà déployé — idempotence', () => {
    expect(decisionDeploiement({ name: 'Déployé' }, STATUTS).action).toBe('deja_deploye');
  });

  it('ne touche jamais un ticket en cours, rouvert ou inconnu', () => {
    for (const nom of ['En cours', 'À faire', 'Rouvert', 'Bloqué']) {
      expect(decisionDeploiement({ name: nom }, STATUTS).action).toBe('hors_perimetre');
    }
    expect(decisionDeploiement(undefined, STATUTS).action).toBe('hors_perimetre');
  });

  it('reconnaît le statut par id en priorité, ce qui survit à un renommage', () => {
    expect(decisionDeploiement({ id: '10001', name: 'Développé' }, STATUTS_ID).action).toBe('transitionner');
    expect(decisionDeploiement({ id: '10002', name: 'Livré' }, STATUTS_ID).action).toBe('deja_deploye');
    // Le nom seul ne suffit plus dès qu'un id est configuré : sinon un statut
    // homonyme d'un autre workflow passerait pour le bon.
    expect(decisionDeploiement({ id: '99999', name: 'Terminé' }, STATUTS_ID).action).toBe('hors_perimetre');
  });

  it('ignore la casse et les espaces du nom quand il n’y a pas d’id', () => {
    expect(decisionDeploiement({ name: ' terminé ' }, STATUTS).action).toBe('transitionner');
  });
});

describe('choisirTransition', () => {
  const transitions = [
    { id: '11', name: 'Rouvrir', to: { id: '10000', name: 'À faire' } },
    { id: '31', name: 'Déployer', to: { id: '10002', name: 'Déployé' } },
  ];

  it('retient la transition qui mène au statut déployé', () => {
    expect(choisirTransition(transitions, STATUTS)?.id).toBe('31');
    expect(choisirTransition(transitions, STATUTS_ID)?.id).toBe('31');
  });

  it('rend null plutôt qu’une transition au hasard quand aucune ne convient', () => {
    expect(choisirTransition([transitions[0]], STATUTS)).toBeNull();
    expect(choisirTransition(undefined, STATUTS)).toBeNull();
  });
});
