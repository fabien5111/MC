// Tests du catalogue de notifications (JEP-278) : la décision de canaux est le
// calcul unique du moteur — une erreur ici, c'est un e-mail refusé qui part,
// ou une confirmation légale qui ne part pas.
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORIE_INFO,
  EVENEMENTS,
  RUBRIQUES,
  evenementsDeRubrique,
  rubriqueInfo,
  rubriquesDeCategorie,
  cleDeGroupe,
  composerNotification,
  decisionCanaux,
  definitionEvenement,
  evenementsDeCategorie,
  listeActeurs,
  preferenceEffective,
  type DefinitionEvenement,
} from '@/lib/notification-events';

const def = (nom: keyof typeof EVENEMENTS) => EVENEMENTS[nom] as DefinitionEvenement;

describe('catalogue', () => {
  it('chaque événement appartient à une catégorie connue', () => {
    for (const [nom, d] of Object.entries(EVENEMENTS)) {
      expect(CATEGORIES, nom).toContain((d as DefinitionEvenement).categorie);
    }
  });
  it('un événement verrouillé a la priorité 0', () => {
    for (const d of Object.values(EVENEMENTS) as DefinitionEvenement[]) {
      if (d.verrouille) expect(d.priorite).toBe(0);
    }
  });
  it('toute catégorie non vide apparaît dans la grille', () => {
    for (const c of CATEGORIES) expect(evenementsDeCategorie(c).length, c).toBeGreaterThan(0);
  });
  it('les valeurs par défaut respectent les rythmes permis', () => {
    for (const r of RUBRIQUES) expect(r.rythmesPermis, r.cle).toContain(r.defaut.rythme);
  });
  it('chaque événement est réglé par une rubrique de sa propre catégorie', () => {
    for (const [nom, d] of Object.entries(EVENEMENTS) as [string, DefinitionEvenement][]) {
      const r = rubriqueInfo(d.rubrique);
      expect(r, nom).not.toBeNull();
      expect(r?.categorie, nom).toBe(d.categorie);
    }
  });
  it('chaque rubrique règle au moins un événement', () => {
    for (const r of RUBRIQUES) expect(evenementsDeRubrique(r.cle).length, r.cle).toBeGreaterThan(0);
  });
  it('les clés de rubrique sont uniques', () => {
    expect(new Set(RUBRIQUES.map((r) => r.cle)).size).toBe(RUBRIQUES.length);
  });
  it('le découpage demandé : 5 / 3 / 3 / 3 sous-catégories', () => {
    expect(rubriquesDeCategorie('mes_recettes')).toHaveLength(5);
    expect(rubriquesDeCategorie('communaute')).toHaveLength(3);
    expect(rubriquesDeCategorie('fournees')).toHaveLength(3);
    expect(rubriquesDeCategorie('idees')).toHaveLength(3);
    for (const c of ['mes_avis', 'abonnement', 'support', 'moderation'] as const) {
      expect(rubriquesDeCategorie(c), c).toHaveLength(1);
    }
  });
  it('seule une rubrique unique de sa catégorie n’a pas de libellé', () => {
    for (const r of RUBRIQUES) {
      const freres = rubriquesDeCategorie(r.categorie);
      if (freres.length > 1) expect(r.libelle, r.cle).toBeTruthy();
    }
  });
  it('retrouve une définition par son nom, null sinon', () => {
    expect(definitionEvenement('recette_publiee')).not.toBeNull();
    expect(definitionEvenement('inconnu')).toBeNull();
  });
});

describe('decisionCanaux', () => {
  it('sans réglage : valeurs par défaut sobres', () => {
    expect(decisionCanaux(def('recette_publiee'), {})).toEqual({ site: true, email: 'immediat' });
    // Communauté : e-mail décoché par défaut.
    expect(decisionCanaux(def('partage_recu'), {})).toEqual({ site: true, email: 'aucun' });
  });
  it('un e-mail décoché reste décoché', () => {
    const prefs = { mes_recettes: { site: true, email: false, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('recette_publiee'), prefs)).toEqual({ site: true, email: 'aucun' });
  });
  it('« aucun » = les deux canaux décochés', () => {
    const prefs = { mes_avis: { site: false, email: false, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('avis_publie'), prefs)).toEqual({ site: false, email: 'aucun' });
  });
  it('un événement verrouillé ignore les préférences', () => {
    const prefs = { abonnement: { site: false, email: false, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('SUBSCRIPTION_CONFIRMED'), prefs)).toEqual({ site: true, email: 'immediat' });
    expect(decisionCanaux(def('contact_deploye'), prefs)).toEqual({ site: true, email: 'immediat' });
  });
  it('l’abonnement non verrouillé garde sa cloche mais respecte l’e-mail décoché', () => {
    const prefs = { abonnement: { site: false, email: false, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('PAYMENT_FAILED'), prefs)).toEqual({ site: true, email: 'aucun' });
  });
  it('« récap seulement » ne produit jamais d’e-mail immédiat', () => {
    const prefs = { mes_recettes: { site: true, email: true, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('recette_favori'), prefs)).toEqual({ site: true, email: 'quotidien' });
    const hebdo = { mes_recettes: { site: true, email: true, rythme: 'hebdo' as const } };
    expect(decisionCanaux(def('recette_favori'), hebdo)).toEqual({ site: true, email: 'hebdo' });
  });
  it('ramène un rythme interdit au premier rythme permis', () => {
    const prefs = { communaute: { site: true, email: true, rythme: 'immediat' as const } };
    expect(preferenceEffective(prefs, 'communaute.abonnes').rythme).toBe('quotidien');
  });
  it('une clé de catégorie se lit comme sa première rubrique', () => {
    expect(preferenceEffective({}, 'mes_recettes')).toEqual(preferenceEffective({}, 'mes_recettes.publication'));
  });
});

describe('regroupement anti-rafale', () => {
  it('calcule la clé à partir de la donnée désignée', () => {
    expect(cleDeGroupe('recette_favori', def('recette_favori'), { recetteId: 12 })).toBe('recette_favori:12');
    expect(cleDeGroupe('recette_publiee', def('recette_publiee'), {})).toBeNull();
  });
  it('liste les acteurs', () => {
    expect(listeActeurs(['Alice'], 1)).toBe('Alice');
    expect(listeActeurs(['Alice', 'Bob'], 2)).toBe('Alice et Bob');
    expect(listeActeurs(['Alice', 'Bob', 'Chloé'], 5)).toBe('Alice, Bob et 3 autres');
    expect(listeActeurs([], 4)).toBe('4 membres');
  });
  it('bascule sur le gabarit groupé au-delà d’une occurrence', () => {
    const seul = composerNotification(def('recette_favori'), { acteur: 'Alice', titre: 'Tarte' });
    expect(seul.corps).toContain('Alice a mis « Tarte »');
    const groupe = composerNotification(def('recette_favori'), { acteurs: ['Alice', 'Bob'], nombre: 5, titre: 'Tarte' });
    expect(groupe.corps).toContain('Alice, Bob et 3 autres ont mis « Tarte »');
  });
});

describe('événements pré-composés (non-régression)', () => {
  it('relaie tel quel le titre et le corps de l’appelant', () => {
    const g = composerNotification(def('TRIAL_J3'), { titre: 'Essai Pro : fin dans 3 jours', detail: 'Corps exact.' });
    expect(g).toEqual({ titre: 'Essai Pro : fin dans 3 jours', corps: 'Corps exact.' });
  });
});

describe('catégories verrouillées', () => {
  it('le support garde ses deux canaux, quoi que le membre ait réglé', () => {
    const prefs = { support: { site: false, email: false, rythme: 'immediat' as const } };
    expect(preferenceEffective(prefs, 'support')).toEqual({ site: true, email: true, rythme: 'immediat' });
  });
  it('l’abonnement garde sa cloche mais son e-mail se décoche', () => {
    const prefs = { abonnement: { site: false, email: false, rythme: 'immediat' as const } };
    expect(preferenceEffective(prefs, 'abonnement')).toEqual({ site: true, email: false, rythme: 'immediat' });
  });
});

describe('grille de préférences', () => {
  it('chaque rubrique explique ce qu’elle couvre', () => {
    for (const r of RUBRIQUES) expect(r.description.trim().length, r.cle).toBeGreaterThan(20);
  });
});

describe('sous-catégories', () => {
  const faveur = (email: boolean, rythme: 'quotidien' | 'hebdo' = 'quotidien') => ({ site: true, email, rythme });

  it('chaque sous-catégorie se règle indépendamment des autres', () => {
    const prefs = { 'mes_recettes.favoris': faveur(true), 'mes_recettes.publication': faveur(false, 'hebdo') };
    expect(decisionCanaux(def('recette_favori'), prefs)).toEqual({ site: true, email: 'quotidien' });
    expect(decisionCanaux(def('recette_publiee'), prefs)).toEqual({ site: true, email: 'aucun' });
    // Une troisième rubrique de la même catégorie reste à son défaut.
    expect(decisionCanaux(def('avis_recu'), prefs)).toEqual({ site: true, email: 'immediat' });
  });
  it('publication et refus partagent la même rubrique', () => {
    expect(def('recette_publiee').rubrique).toBe(def('recette_refusee').rubrique);
  });
  it('la ligne d’une catégorie vaut pour ses rubriques tant qu’aucune n’est réglée (héritage)', () => {
    // Reprise de notify_email = false : « e-mail décoché » sur toute la catégorie.
    const herite = { mes_recettes: faveur(false, 'hebdo') };
    for (const nom of ['recette_publiee', 'avis_recu', 'recette_favori', 'recette_composant', 'recette_mise_en_avant'] as const) {
      expect(decisionCanaux(def(nom), herite), nom).toEqual({ site: true, email: 'aucun' });
    }
  });
  it('une rubrique réglée l’emporte sur la ligne de sa catégorie', () => {
    const prefs = { mes_recettes: faveur(false, 'hebdo'), 'mes_recettes.avis': { site: true, email: true, rythme: 'immediat' as const } };
    expect(decisionCanaux(def('avis_recu'), prefs)).toEqual({ site: true, email: 'immediat' });
    expect(decisionCanaux(def('recette_publiee'), prefs)).toEqual({ site: true, email: 'aucun' });
  });
  it('les rubriques « récap seulement » proposent des valeurs sobres par défaut', () => {
    for (const nom of ['recette_favori', 'recette_composant', 'nouvel_abonne', 'recette_suivi', 'idee_realisee'] as const) {
      expect(decisionCanaux(def(nom), {}), nom).toEqual({ site: true, email: 'aucun' });
    }
  });
});
