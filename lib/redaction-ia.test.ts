import { describe, expect, it } from 'vitest';
import {
  ajouterNoteAvance,
  ajouterTexte,
  champsVides,
  cibleValide,
  coutCompletion,
  lireCible,
  normaliserPropositions,
  normaliserRecette,
  texteRecette,
  texteTemps,
  ligneIngredient,
  ETAPES_MAX_COMPLETION,
  type RecetteRedaction,
} from '@/lib/redaction-ia';
import { lignesCoutIA, DROIT_ACTION } from '@/lib/credits-ia';
import { buildRedaction } from '@/lib/ai/redaction';

const etape = (p: Partial<RecetteRedaction['etapes'][number]> = {}) => ({
  titre: 'Crème pâtissière',
  texte: 'Chauffer le lait\nBlanchir les jaunes',
  ingredients: ['500 ml Lait', '4 Jaune d’œuf'],
  temps: '',
  conseils: '',
  avance: false,
  avanceNote: '',
  ...p,
});

const recette = (p: Partial<RecetteRedaction> = {}): RecetteRedaction => ({
  titre: 'Tarte aux fraises',
  description: '',
  rendement: '',
  etapes: [etape()],
  conseils: '',
  degustation: '',
  ...p,
});

describe('coutCompletion', () => {
  it('1 crédit par tranche de 3 champs, 2 au minimum', () => {
    expect(coutCompletion(0)).toBe(2);
    expect(coutCompletion(1)).toBe(2);
    expect(coutCompletion(3)).toBe(2);
    expect(coutCompletion(6)).toBe(2);
    expect(coutCompletion(7)).toBe(3);
    expect(coutCompletion(15)).toBe(5);
  });
  it('les deux actions ouvrent sur le droit redaction_ia', () => {
    expect(DROIT_ACTION.redaction_champ).toBe('redaction_ia');
    expect(DROIT_ACTION.redaction_completion).toBe('redaction_ia');
    expect(lignesCoutIA('redaction_ia')?.length).toBe(2);
  });
});

describe('champsVides', () => {
  it('liste la recette puis chaque étape, dans l’ordre', () => {
    const { cibles } = champsVides(recette());
    expect(cibles).toEqual([
      { champ: 'description' },
      { champ: 'conseils' },
      { champ: 'degustation' },
      { champ: 'conseil_etape', etape: 0 },
      { champ: 'avance_etape', etape: 0 },
    ]);
  });
  it('un champ rempli n’est pas proposé ; case cochée sans note = vide', () => {
    const r = recette({
      description: 'Une tarte',
      conseils: 'x',
      degustation: 'y',
      etapes: [etape({ conseils: 'z', avance: true, avanceNote: '' }), etape({ conseils: 'z', avance: true, avanceNote: '48 h au frais' })],
    });
    expect(champsVides(r).cibles).toEqual([{ champ: 'avance_etape', etape: 0 }]);
  });
  it('ignore une étape vide et plafonne à 12 étapes', () => {
    const etapes = [etape({ titre: '', texte: '', ingredients: [] }), ...Array.from({ length: 14 }, () => etape())];
    const { cibles, etapesIgnorees } = champsVides(recette({ etapes }));
    expect(cibles.some((c) => c.etape === 0)).toBe(false);
    expect(new Set(cibles.filter((c) => c.etape != null).map((c) => c.etape)).size).toBe(ETAPES_MAX_COMPLETION);
    expect(etapesIgnorees).toBe(2);
  });
});

describe('lireCible / cibleValide', () => {
  it('refuse un champ inconnu ou une étape hors recette', () => {
    expect(lireCible({ champ: 'titre' })).toBeNull();
    expect(lireCible({ champ: 'conseil_etape' })).toBeNull();
    const r = recette();
    expect(cibleValide(r, { champ: 'conseil_etape', etape: 3 })).toBe(false);
    expect(cibleValide(r, { champ: 'conseil_etape', etape: 0 })).toBe(true);
    expect(lireCible({ champ: 'description', etape: 2 })).toEqual({ champ: 'description' });
  });
});

describe('normaliserRecette', () => {
  it('borne et rejette une recette vide', () => {
    expect(normaliserRecette(null)).toBeNull();
    expect(normaliserRecette({ titre: '', etapes: [] })).toBeNull();
    const r = normaliserRecette({ titre: 'x'.repeat(500), etapes: Array.from({ length: 60 }, () => ({ titre: 'a' })) });
    expect(r?.titre.length).toBe(160);
    expect(r?.etapes.length).toBe(40);
  });
});

describe('normaliserPropositions', () => {
  const cibles = [{ champ: 'description' as const }, { champ: 'avance_etape' as const, etape: 0 }, { champ: 'conseil_etape' as const, etape: 0 }];
  it('ne garde que les cibles demandées, dans l’ordre de l’éditeur', () => {
    const ps = normaliserPropositions(
      {
        propositions: [
          { champ: 'conseil_etape', etape: 0, texte: 'Filmer au contact.' },
          { champ: 'conseils', texte: 'non demandé' },
          { champ: 'description', texte: '  Une tarte fraîche.  ' },
          { champ: 'description', texte: 'doublon' },
          { champ: 'conseil_etape', etape: 4, texte: 'autre étape' },
        ],
      },
      cibles,
    );
    expect(ps.map((p) => p.champ)).toEqual(['description', 'conseil_etape']);
    expect(ps[0].texte).toBe('Une tarte fraîche.');
  });
  it('préparation à l’avance : « impossible » est une réponse, une note vide non', () => {
    expect(normaliserPropositions({ propositions: [{ champ: 'avance_etape', etape: 0, possible: false, texte: 'x' }] }, cibles)).toEqual([
      { champ: 'avance_etape', etape: 0, possible: false, texte: '' },
    ]);
    expect(normaliserPropositions({ propositions: [{ champ: 'avance_etape', etape: 0, possible: true, texte: '' }] }, cibles)).toEqual([]);
    const long = normaliserPropositions({ propositions: [{ champ: 'avance_etape', etape: 0, texte: 'a\nb '.repeat(200) }] }, cibles);
    expect(long[0].texte.length).toBeLessThanOrEqual(200);
    expect(long[0].texte).not.toContain('\n');
  });
  it('réponse illisible : rien', () => {
    expect(normaliserPropositions('oups', cibles)).toEqual([]);
  });
});

describe('ajouterTexte / ajouterNoteAvance', () => {
  it('champ vide : la proposition seule ; sinon une ligne vide entre les deux', () => {
    expect(ajouterTexte('', 'Nouveau')).toBe('Nouveau');
    expect(ajouterTexte('   ', 'Nouveau')).toBe('Nouveau');
    expect(ajouterTexte('Existant\n', 'Nouveau')).toBe('Existant\n\nNouveau');
  });
  it('note : ajoutée si elle tient en 200 caractères, remplacée sinon', () => {
    expect(ajouterNoteAvance('', '48 h au frais')).toBe('48 h au frais');
    expect(ajouterNoteAvance('Filmée.', '48 h au frais')).toBe('Filmée. 48 h au frais');
    expect(ajouterNoteAvance('x'.repeat(190), '48 h au frais')).toBe('48 h au frais');
  });
});

describe('mise en texte', () => {
  it('ingrédients, temps et recette', () => {
    expect(ligneIngredient({ name: 'Farine', qty: '200', unit: 'g', comment: 'tamisée' })).toBe('200 g Farine — tamisée');
    expect(ligneIngredient({ name: '  ' })).toBe('');
    expect(texteTemps({ prep: 20, cook: 90, temp: 180, wait: null })).toBe('Préparation 20 min · Cuisson 1h30 à 180 °C');
    const t = texteRecette(recette());
    expect(t).toContain('ÉTAPE 1 — Crème pâtissière');
    expect(t).toContain('- 500 ml Lait');
  });
  it('l’invite nomme chaque champ demandé et le texte à compléter', () => {
    const r = recette({ conseils: 'Utiliser des fraises de saison.' });
    const p = buildRedaction(r, [{ champ: 'conseils' }, { champ: 'avance_etape', etape: 0 }]);
    expect(p).toContain('{"champ": "conseils"}');
    expect(p).toContain('{"champ": "avance_etape", "etape": 0} (ÉTAPE 1)');
    expect(p).toContain('COMPLÉMENT');
  });
});
