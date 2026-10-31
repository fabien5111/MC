// « La dernière fois » (JEP-381) : ce que le membre a constaté la dernière
// fois qu'il a fait cette recette, remis sous ses yeux au moment où ça sert —
// au lancement d'une fournée et sous chaque étape de la fournée suivante.
//
// Logique pure (aucun accès base), testée dans `batch-lecons.test.ts`. La
// lecture de la fournée de référence vit dans `batch-lecons-data.ts`.
//
// Rien n'est copié : tout est LU depuis la fournée de référence. Corriger un
// constat après coup se reflète donc partout.
import { fmtNum } from '@/lib/recipe-plan';
import { normSearch } from '@/lib/text-search';
import { ingredientKey } from '@/lib/ingredient-name';

// Longueur maximale de « À retenir pour la prochaine fois » (`batches.lecon`).
export const LECON_MAX = 500;

// ── Fournée de référence ────────────────────────────────────────────────
// Forme étroite, lue par `getFourneeReference` : seuls les constats du jour J
// et ce qu'il faut pour apparier les étapes.
export type RefSubstep = { texte: string; commentaire: string | null; order_index: number };
export type RefStep = {
  id: number;
  source_step_id: number | null;
  title: string | null;
  order_index: number;
  commentaire: string | null;
  batch_substeps: RefSubstep[];
};
export type RefIngredient = {
  batch_step_id: number | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  real_quantity: number | null;
  commentaire: string | null;
  order_index: number;
};
export type FourneeReference = {
  id: number;
  // Date de clôture (`date_fin`), à défaut date prévue.
  date: string | null;
  commentaire_global: string | null;
  // `batches.lecon` — absente avant la migration (lot 2) : `null`.
  lecon: string | null;
  batch_steps: RefStep[];
  batch_ingredients: RefIngredient[];
};

// ── Constats ────────────────────────────────────────────────────────────
export type ConstatIngredient = {
  nom: string;
  commentaire: string | null;
  // « 180 g utilisés au lieu de 200 g », `null` sans écart.
  ecart: string | null;
  // Ligne de la fournée courante qui correspond (même `ingredientKey` + unité
  // dans l'étape appariée), `null` sinon.
  ingredientId: number | null;
};
export type ConstatEtape = {
  titre: string;
  commentaire: string | null;
  sousEtapes: { texte: string; commentaire: string }[];
  ingredients: ConstatIngredient[];
};
export type Lecons = {
  // Constats rattachés à une étape de la fournée courante (clé : son id).
  parEtape: Record<number, ConstatEtape>;
  // Constats dont l'étape n'a pas été retrouvée : jamais perdus en silence.
  autres: ConstatEtape[];
};

export type EtapeCourante = { id: number; source_step_id: number | null; title: string | null; order_index: number };
export type IngredientCourant = { id: number; batch_step_id: number | null; name: string; unit: string | null };

function texte(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

function uniteCle(u: string | null | undefined): string {
  return (u ?? '').trim().toLowerCase();
}

// « 180 g utilisés au lieu de 200 g » ; `null` si aucune quantité réelle n'a
// été saisie ou si elle vaut la quantité prévue.
export function ecartQuantite(it: Pick<RefIngredient, 'quantity' | 'real_quantity' | 'unit'>): string | null {
  if (it.real_quantity == null || it.quantity == null) return null;
  if (Math.abs(it.real_quantity - it.quantity) < 1e-9) return null;
  const u = texte(it.unit) ? ' ' + texte(it.unit) : '';
  return `${fmtNum(it.real_quantity)}${u} utilisés au lieu de ${fmtNum(it.quantity)}${u}`;
}

// Constats d'une étape de la fournée de référence ; `null` si elle n'en porte
// aucun (rien à afficher).
function constatsEtape(step: RefStep, ingredients: RefIngredient[]): (ConstatEtape & { _ings: RefIngredient[] }) | null {
  const sousEtapes = [...step.batch_substeps]
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((su) => {
      const c = texte(su.commentaire);
      return c ? [{ texte: su.texte, commentaire: c }] : [];
    });
  const ings = ingredients
    .filter((it) => it.batch_step_id === step.id && (texte(it.commentaire) || ecartQuantite(it)))
    .sort((a, b) => a.order_index - b.order_index);
  const commentaire = texte(step.commentaire);
  if (!commentaire && !sousEtapes.length && !ings.length) return null;
  return {
    titre: texte(step.title) ?? 'Étape',
    commentaire,
    sousEtapes,
    ingredients: ings.map((it) => ({ nom: it.name, commentaire: texte(it.commentaire), ecart: ecartQuantite(it), ingredientId: null })),
    _ings: ings,
  };
}

// Appariement des étapes : les id des étapes de recette changent à chaque
// enregistrement de /creer (delete + insert), d'où trois essais successifs :
//   1. même `source_step_id` (vrai dans une chaîne « Refaire » et tant que la
//      recette n'a pas été réenregistrée) ;
//   2. sinon même titre normalisé (`normSearch`), dans l'ordre du déroulé —
//      deux étapes « Cuisson » s'apparient la première à la première ;
//   3. sinon le constat part dans `autres`.
// Une étape courante ne reçoit jamais deux constats.
export function leconsPrecedentes(ref: FourneeReference, courantes: EtapeCourante[], ingredientsCourants: IngredientCourant[] = []): Lecons {
  const parEtape: Record<number, ConstatEtape> = {};
  const autres: ConstatEtape[] = [];
  const refSteps = [...ref.batch_steps].sort((a, b) => a.order_index - b.order_index);
  const steps = [...courantes].sort((a, b) => a.order_index - b.order_index);
  const prises = new Set<number>();
  const appariement = new Map<number, number>(); // id étape de référence → id étape courante

  // 1. source_step_id
  for (const r of refSteps) {
    if (r.source_step_id == null) continue;
    const c = steps.find((s) => !prises.has(s.id) && s.source_step_id === r.source_step_id);
    if (c) {
      prises.add(c.id);
      appariement.set(r.id, c.id);
    }
  }
  // 2. titre normalisé
  for (const r of refSteps) {
    if (appariement.has(r.id)) continue;
    const t = normSearch(r.title ?? '').trim();
    if (!t) continue;
    const c = steps.find((s) => !prises.has(s.id) && normSearch(s.title ?? '').trim() === t);
    if (c) {
      prises.add(c.id);
      appariement.set(r.id, c.id);
    }
  }

  for (const r of refSteps) {
    const constat = constatsEtape(r, ref.batch_ingredients);
    if (!constat) continue;
    const { _ings, ...propre } = constat;
    const cible = appariement.get(r.id);
    if (cible == null) {
      autres.push(propre);
      continue;
    }
    // Ingrédients : dans l'étape appariée, par ingredientKey + unité.
    const candidats = ingredientsCourants.filter((it) => it.batch_step_id === cible);
    const pris = new Set<number>();
    propre.ingredients = propre.ingredients.map((ci, i) => {
      const src = _ings[i];
      const k = ingredientKey(src.name);
      const u = uniteCle(src.unit);
      const m = candidats.find((it) => !pris.has(it.id) && ingredientKey(it.name) === k && uniteCle(it.unit) === u);
      if (m) pris.add(m.id);
      return { ...ci, ingredientId: m?.id ?? null };
    });
    parEtape[cible] = propre;
  }
  return { parEtape, autres };
}

// Un constat d'étape, d'ingrédient ou de sous-étape existe-t-il quelque part ?
export function aDesConstatsEtapes(ref: FourneeReference): boolean {
  return ref.batch_steps.some((s) => constatsEtape(s, ref.batch_ingredients) != null);
}

// Nombre d'étapes porteuses d'un constat (encadré du lancement).
export function nombreEtapesAnnotees(ref: FourneeReference): number {
  return ref.batch_steps.filter((s) => constatsEtape(s, ref.batch_ingredients) != null).length;
}

// La fournée de référence a-t-elle quoi que ce soit à dire ?
export function referenceAffichable(ref: FourneeReference | null): ref is FourneeReference {
  return !!ref && (!!texte(ref.commentaire_global) || !!texte(ref.lecon) || aDesConstatsEtapes(ref));
}

// « 12/09 » — date courte de l'encadré.
export function dateCourte(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(+d)) return null;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Zurich' });
}

// Valeur à écrire dans `batches.lecon` : espaces de bord retirés, tronquée,
// vide → `null`.
export function normaliserLecon(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().slice(0, LECON_MAX);
  return t ? t : null;
}

// Lecture tolérante de `batches.lecon` (colonne absente avant la migration).
export function lireLecon(row: unknown): string | null {
  const v = (row as { lecon?: unknown } | null)?.lecon;
  return typeof v === 'string' ? texte(v) : null;
}
