// Extraire une ou plusieurs étapes d'une recette pour en faire une recette à
// part entière (JEP-258) — la crème pâtissière d'un mille-feuille, la pâte
// sucrée d'une tarte, réutilisables ensuite comme recette de base.
//
// Logique pure, partagée par la fenêtre de la fiche recette (titre et poids
// proposés) et par la route `POST /api/recette/extraire` (seule à écrire) :
// les deux calculent la même chose, et la route ne fait jamais confiance au
// navigateur pour le contenu copié — elle relit la recette sous la session.
//
// Arbitrages du 19/10/2026 :
//  - depuis la fiche recette uniquement ;
//  - plusieurs étapes possibles ;
//  - **copie seule** : la recette d'origine n'est ni modifiée ni reliée à la
//    copie (même doctrine que les fournées et les composants de projet) ;
//  - l'auteur d'origine est **crédité** (champ « Source » de la copie), sauf
//    quand on extrait sa propre recette ;
//  - rendement déduit du poids des ingrédients copiés, modifiable avant la
//    création.
import { estimateWeightGrams, type ConversionRef, type UnitRef, type WeightEstimate } from '@/lib/ingredient-conversions';
import { fixOeufLigature } from '@/lib/text';

// Clé du droit d'abonnement (plan Pro). Une clé absente de la grille vaut
// refus (`canAccess`) : tant que la ligne n'est pas posée en base, la
// fonctionnalité reste fermée à tous, jamais ouverte par oubli.
export const DROIT_EXTRACTION = 'extraction_etapes';

export const EXTRACTION_TITRE_MAX = 120;
// Plafond de rendement saisi (en grammes) : au-delà, c'est une faute de frappe.
export const EXTRACTION_POIDS_MAX = 100_000;

// Étape de la recette d'origine, réduite à ce que la copie lit. Structurellement
// compatible avec `RecipeStepView` + son groupe d'ingrédients (lib/recipes.ts).
export type EtapeSource = {
  id: number;
  title: string | null;
  description: string | null;
  sous_etapes: unknown;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  tips: string | null;
  video_url: string | null;
  day_offset: number | null;
  order_index: number | null;
  step_photos?: { url: string; original_url?: string | null; order_index: number | null; ai_retouched: boolean }[];
};

export type IngredientSource = {
  name: string;
  quantity: string | null;
  unit: string | null;
  comment: string | null;
  allergen: string | null;
  ref_id: number | null;
  order_index: number | null;
};

export type GroupeSource = {
  order_index: number | null;
  scaling_mode?: string | null;
  ingredients: IngredientSource[] | null;
};

// Étape telle qu'elle sera écrite dans la nouvelle recette.
export type EtapeExtraite = {
  title: string | null;
  description: string | null;
  sous_etapes: string[] | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  tips: string | null;
  video_url: string | null;
  day_offset: number;
  scaling_mode: string | null;
  ingredients: Omit<IngredientSource, 'order_index'>[];
  photos: { url: string; original_url: string | null; ai_retouched: boolean }[];
};

const parQ = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

// Étapes retenues, dans l'ordre de la recette — jamais dans l'ordre des
// cases cochées : la copie doit se lire comme l'original.
export function etapesRetenues<E extends Pick<EtapeSource, 'id' | 'order_index'>>(etapes: E[], ids: Iterable<number>): E[] {
  const voulues = new Set(ids);
  return [...etapes].filter((e) => voulues.has(e.id)).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

// Contenu à écrire. Le jour de chaque étape est recalé pour que la dernière
// étape retenue tombe le jour J : un `day_offset` compte à rebours depuis la
// dégustation de SA recette, et la préparation extraite est prête à la fin
// de sa propre dernière étape (une crème faite à J-1 dans le mille-feuille
// est une recette « jour J » une fois seule). Les écarts entre étapes, eux,
// sont conservés — une nuit de repos reste une nuit de repos.
export function planExtraction(etapes: EtapeSource[], groupes: GroupeSource[], ids: Iterable<number>): EtapeExtraite[] {
  const retenues = etapesRetenues(etapes, ids);
  if (!retenues.length) return [];
  const groupeParOrdre = new Map(groupes.map((g) => [g.order_index ?? 0, g]));
  const jourMin = Math.min(...retenues.map((e) => Math.max(0, e.day_offset ?? 0)));

  return retenues.map((e) => {
    const groupe = groupeParOrdre.get(e.order_index ?? 0);
    const sous = Array.isArray(e.sous_etapes) ? e.sous_etapes.map((x) => String(x)).filter((x) => x.trim()) : [];
    return {
      title: e.title,
      description: e.description,
      sous_etapes: sous.length ? sous : null,
      prep_time: e.prep_time,
      cook_time: e.cook_time,
      wait_time: e.wait_time,
      cook_temp: e.cook_temp,
      tips: e.tips,
      video_url: e.video_url,
      day_offset: Math.max(0, e.day_offset ?? 0) - jourMin,
      // Repris tel quel : c'est lui qui décide qu'une pâte à foncer suive la
      // surface à l'ajustement d'une fournée (`scalingCoef`).
      scaling_mode: groupe?.scaling_mode ?? null,
      ingredients: [...(groupe?.ingredients ?? [])]
        .filter((it) => (it.name || '').trim())
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((it) => ({
          name: fixOeufLigature(it.name.trim()),
          quantity: it.quantity,
          unit: it.unit,
          comment: it.comment,
          allergen: it.allergen,
          ref_id: it.ref_id,
        })),
      // Les photos sont des URL du stockage objet : la copie pointe vers les
      // mêmes objets, rien n'est redéposé.
      photos: [...(e.step_photos ?? [])]
        .filter((p) => p.url)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((p) => ({ url: p.url, original_url: p.original_url ?? null, ai_retouched: p.ai_retouched })),
    };
  });
}

// Poids des ingrédients des étapes retenues — le rendement proposé. Même
// estimation que le remplacement d'une étape d'une fournée
// (`StepExpandDialog`) : jamais de densité générique, et les lignes qu'on ne
// sait pas peser sont rendues pour être annoncées, pas tues.
export function poidsExtraction(
  ingredients: { name: string; quantity: string | null; unit: string | null; ref_id: number | null }[],
  conversions: ConversionRef[],
  units: UnitRef[],
  densities?: { name: string; density_g_per_ml: number }[],
): WeightEstimate {
  return estimateWeightGrams(
    ingredients.map((it) => ({ name: it.name, quantity: parQ(it.quantity), unit: it.unit, ref_id: it.ref_id })),
    conversions,
    units,
    densities,
  );
}

// Titre proposé : celui de l'étape quand il n'y en a qu'une (« Crème
// pâtissière »), sinon « <recette> — préparation » — l'utilisateur le
// corrige de toute façon dans la fenêtre.
export function titreParDefaut(etapes: Pick<EtapeSource, 'title'>[], titreRecette: string): string {
  const seul = etapes.length === 1 ? (etapes[0].title || '').trim() : '';
  return (seul || `${titreRecette.trim()} — préparation`).slice(0, EXTRACTION_TITRE_MAX);
}

// Crédit écrit dans le champ « Source » de la copie, ou `null` quand on
// extrait sa propre recette : se créditer soi-même n'apprend rien, et la
// source resterait à effacer à la main (arbitrage du 19/10/2026).
export function creditExtraction(titreRecette: string, auteur: string | null, memeAuteur: boolean): string | null {
  if (memeAuteur) return null;
  const base = `Extrait de « ${titreRecette.trim()} »`;
  const nom = (auteur || '').trim();
  return nom ? `${base}, de ${nom}` : base;
}

// Colonnes de rendement de la copie : « Par nombre d'unités / poids », en
// grammes — la même forme que le rendement d'une fiche de composant
// (`rendementComposant`). Sans poids, rien n'est posé : le rendement reste à
// saisir dans l'éditeur.
export function rendementExtraction(grammes: number | null): { measure_type: string; yield_qty: string; yield_unit: string } | null {
  if (grammes == null || !isFinite(grammes) || grammes <= 0) return null;
  return { measure_type: 'units', yield_qty: String(Math.round(grammes)), yield_unit: 'g' };
}

// Poids saisi dans la fenêtre → grammes, ou `null` (vide, illisible, hors
// bornes). La route revalide avec la même fonction.
export function lirePoidsSaisi(v: unknown): number | null {
  const n = parQ(v);
  if (n == null || n <= 0 || n > EXTRACTION_POIDS_MAX) return null;
  return Math.round(n);
}
