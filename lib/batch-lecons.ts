// « La dernière fois » (JEP-381) : ce que le membre a constaté lors de ses
// fournées précédentes d'une recette, remis sous ses yeux au moment où ça
// sert — au lancement d'une fournée, sous chaque étape de la fournée suivante,
// et, pour l'auteur de la recette, sur sa fiche.
//
// Logique pure (aucun accès base), testée dans `batch-lecons.test.ts`. La
// lecture vit dans `batch-lecons-data.ts`, l'écriture des choix dans
// `batch-lecons-client.ts`.
//
// Règle d'affichage, la même pour l'auteur et pour les autres membres :
//   les remarques de la fournée de référence (la dernière), SAUF celles que
//   le membre a écartées, PLUS celles qu'il a gardées dans des fournées
//   précédentes.
// Seul le sens du geste diffère : « écarter » veut dire « corrigé dans ma
// recette » pour l'auteur, « ne m'intéresse pas » pour un autre membre.
//
// Rien n'est copié dans la fournée : tout est LU. La seule copie est celle de
// `remarques_gardees.texte`, qui ne sert que si la fournée d'origine a été
// supprimée — une remarque gardée ne doit pas disparaître avec elle.
import { fmtNum } from '@/lib/recipe-plan';
import { normSearch } from '@/lib/text-search';
import { ingredientKey } from '@/lib/ingredient-name';

// Longueur maximale de « À retenir pour la prochaine fois » (`batches.lecon`).
export const LECON_MAX = 500;

// ── Fournée de référence ────────────────────────────────────────────────
// Forme étroite : seuls les constats du jour J et ce qu'il faut pour
// apparier les étapes. `BatchFull` la satisfait (cf. `versReference`).
export type RefSubstep = { id: number; texte: string; commentaire: string | null; order_index: number };
export type RefStep = {
  id: number;
  source_step_id: number | null;
  title: string | null;
  order_index: number;
  commentaire: string | null;
  batch_substeps: RefSubstep[];
};
export type RefIngredient = {
  id: number;
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
  // `batches.lecon` — absente avant la migration : `null`.
  lecon: string | null;
  batch_steps: RefStep[];
  batch_ingredients: RefIngredient[];
};

// ── Remarques ───────────────────────────────────────────────────────────
export type NatureRemarque = 'etape' | 'sous_etape' | 'ingredient' | 'global' | 'lecon';
export type StatutRemarque = 'gardee' | 'ecartee';

export type Remarque = {
  // Identité stable d'une remarque : sa nature et l'id de la ligne qui la
  // porte (étape, sous-étape, ingrédient de fournée ; la fournée elle-même
  // pour le commentaire global et la leçon).
  cle: string;
  nature: NatureRemarque;
  ligneId: number;
  batchId: number | null;
  date: string | null;
  // Étape de fournée qui porte la remarque (null pour global / leçon).
  etapeId: number | null;
  etapeTitre: string | null;
  sourceStepId: number | null;
  ordre: number;
  // Texte de la sous-étape, nom de l'ingrédient.
  libelle: string | null;
  unite: string | null;
  // Commentaire saisi.
  texte: string | null;
  // « 180 g utilisés au lieu de 200 g ».
  ecart: string | null;
  // Choix du membre ; `null` = rien décidé.
  statut: StatutRemarque | null;
  // Ingrédient de la fournée courante qui correspond (appariement).
  ingredientId?: number | null;
};

// Ligne de `remarques_gardees` telle que lue en base (texte éventuellement
// rafraîchi depuis la fournée d'origine par la couche de données).
export type DecisionRemarque = {
  nature: NatureRemarque;
  ligne_id: number;
  statut: StatutRemarque;
  batch_id: number | null;
  fournee_du: string | null;
  etape_id: number | null;
  etape_titre: string | null;
  source_step_id: number | null;
  ordre: number | null;
  libelle: string | null;
  unite: string | null;
  texte: string | null;
  ecart: string | null;
};

export const cleRemarque = (nature: NatureRemarque, ligneId: number) => `${nature}:${ligneId}`;

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

const ORDRE_NATURE: Record<NatureRemarque, number> = { lecon: 0, global: 1, etape: 2, sous_etape: 3, ingredient: 4 };

// Toutes les remarques d'une fournée (sans décision).
export function remarquesDeFournee(ref: FourneeReference): Remarque[] {
  const out: Remarque[] = [];
  const base = { batchId: ref.id, date: ref.date, statut: null, libelle: null, unite: null, ecart: null } as const;
  const lecon = texte(ref.lecon);
  if (lecon) out.push({ ...base, cle: cleRemarque('lecon', ref.id), nature: 'lecon', ligneId: ref.id, etapeId: null, etapeTitre: null, sourceStepId: null, ordre: -2, texte: lecon });
  const glob = texte(ref.commentaire_global);
  if (glob) out.push({ ...base, cle: cleRemarque('global', ref.id), nature: 'global', ligneId: ref.id, etapeId: null, etapeTitre: null, sourceStepId: null, ordre: -1, texte: glob });
  const steps = [...ref.batch_steps].sort((a, b) => a.order_index - b.order_index);
  for (const s of steps) {
    const etape = { etapeId: s.id, etapeTitre: texte(s.title), sourceStepId: s.source_step_id, ordre: s.order_index };
    const c = texte(s.commentaire);
    if (c) out.push({ ...base, ...etape, cle: cleRemarque('etape', s.id), nature: 'etape', ligneId: s.id, texte: c });
    for (const su of [...(s.batch_substeps ?? [])].sort((a, b) => a.order_index - b.order_index)) {
      const cs = texte(su.commentaire);
      if (cs) out.push({ ...base, ...etape, cle: cleRemarque('sous_etape', su.id), nature: 'sous_etape', ligneId: su.id, libelle: su.texte, texte: cs });
    }
    for (const it of ref.batch_ingredients.filter((i) => i.batch_step_id === s.id).sort((a, b) => a.order_index - b.order_index)) {
      const ci = texte(it.commentaire);
      const ecart = ecartQuantite(it);
      if (ci || ecart) out.push({ ...base, ...etape, cle: cleRemarque('ingredient', it.id), nature: 'ingredient', ligneId: it.id, libelle: it.name, unite: it.unit, texte: ci, ecart });
    }
  }
  return out;
}

function depuisDecision(d: DecisionRemarque): Remarque {
  return {
    cle: cleRemarque(d.nature, d.ligne_id),
    nature: d.nature,
    ligneId: d.ligne_id,
    batchId: d.batch_id,
    date: d.fournee_du,
    etapeId: d.etape_id,
    etapeTitre: texte(d.etape_titre),
    sourceStepId: d.source_step_id,
    ordre: d.ordre ?? 0,
    libelle: d.libelle,
    unite: d.unite,
    texte: texte(d.texte),
    ecart: texte(d.ecart),
    statut: d.statut,
  };
}

// La règle d'affichage : remarques de la référence moins les écartées, plus
// les gardées venues d'autres fournées (les plus récentes d'abord).
export function remarquesAffichees(ref: FourneeReference | null, decisions: DecisionRemarque[]): Remarque[] {
  const parCle = new Map(decisions.map((d) => [cleRemarque(d.nature, d.ligne_id), d]));
  const deRef = ref ? remarquesDeFournee(ref) : [];
  const vues = new Set(deRef.map((r) => r.cle));
  const out: Remarque[] = [];
  for (const r of deRef) {
    const d = parCle.get(r.cle);
    if (d?.statut === 'ecartee') continue;
    out.push({ ...r, statut: d?.statut ?? null });
  }
  const anciennes = decisions
    .filter((d) => d.statut === 'gardee' && !vues.has(cleRemarque(d.nature, d.ligne_id)))
    .map(depuisDecision)
    // Commentaire effacé depuis dans la fournée d'origine : plus rien à garder.
    .filter((r) => r.texte || r.ecart)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.ordre - b.ordre || ORDRE_NATURE[a.nature] - ORDRE_NATURE[b.nature]);
  return [...out, ...anciennes];
}

// ── Rattachement aux étapes courantes ───────────────────────────────────
export type ConstatEtape = { titre: string; remarques: Remarque[] };
export type Lecons = {
  // Remarques rattachées à une étape courante (clé : son id).
  parEtape: Record<number, ConstatEtape>;
  // Remarques dont l'étape n'a pas été retrouvée : jamais perdues en silence.
  autres: ConstatEtape[];
  // Leçon et commentaires globaux.
  generales: Remarque[];
};

export type EtapeCourante = { id: number; source_step_id: number | null; title: string | null; order_index: number };
export type IngredientCourant = { id: number; batch_step_id: number | null; name: string; unit: string | null };

// Appariement des étapes : les id des étapes de recette changent à chaque
// enregistrement de /creer (delete + insert), d'où trois essais successifs,
// fournée d'origine par fournée d'origine :
//   1. même `source_step_id` (vrai dans une chaîne « Refaire » et tant que la
//      recette n'a pas été réenregistrée) ;
//   2. sinon même titre normalisé (`normSearch`), dans l'ordre du déroulé —
//      deux étapes « Cuisson » s'apparient la première à la première ;
//   3. sinon la remarque part dans `autres`.
// Dans une même fournée d'origine, une étape courante ne reçoit qu'une étape.
export function leconsPrecedentes(remarques: Remarque[], courantes: EtapeCourante[], ingredientsCourants: IngredientCourant[] = []): Lecons {
  const parEtape: Record<number, ConstatEtape> = {};
  const autres: ConstatEtape[] = [];
  const generales = remarques.filter((r) => r.nature === 'global' || r.nature === 'lecon');
  const steps = [...courantes].sort((a, b) => a.order_index - b.order_index);

  // Groupes : une étape d'une fournée d'origine.
  type Groupe = { cleG: string; batch: string; titre: string | null; sourceStepId: number | null; ordre: number; remarques: Remarque[] };
  const groupes = new Map<string, Groupe>();
  for (const r of remarques) {
    if (r.nature === 'global' || r.nature === 'lecon') continue;
    const batch = String(r.batchId ?? `x${r.date ?? ''}`);
    const cleG = `${batch}:${r.etapeId ?? r.etapeTitre ?? ''}`;
    let g = groupes.get(cleG);
    if (!g) {
      g = { cleG, batch, titre: r.etapeTitre, sourceStepId: r.sourceStepId, ordre: r.ordre, remarques: [] };
      groupes.set(cleG, g);
    }
    g.remarques.push(r);
  }

  const prisesParBatch = new Map<string, Set<number>>();
  const cible = new Map<string, number>();
  const liste = [...groupes.values()].sort((a, b) => a.ordre - b.ordre);
  for (const passe of [1, 2] as const) {
    for (const g of liste) {
      if (cible.has(g.cleG)) continue;
      const prises = prisesParBatch.get(g.batch) ?? new Set<number>();
      let c: EtapeCourante | undefined;
      if (passe === 1) {
        if (g.sourceStepId == null) continue;
        c = steps.find((s) => !prises.has(s.id) && s.source_step_id === g.sourceStepId);
      } else {
        const t = normSearch(g.titre ?? '').trim();
        if (!t) continue;
        c = steps.find((s) => !prises.has(s.id) && normSearch(s.title ?? '').trim() === t);
      }
      if (c) {
        prises.add(c.id);
        prisesParBatch.set(g.batch, prises);
        cible.set(g.cleG, c.id);
      }
    }
  }

  const tri = (a: Remarque, b: Remarque) =>
    (b.date ?? '').localeCompare(a.date ?? '') || ORDRE_NATURE[a.nature] - ORDRE_NATURE[b.nature];

  for (const g of liste) {
    const id = cible.get(g.cleG);
    if (id == null) {
      autres.push({ titre: g.titre ?? 'Étape', remarques: [...g.remarques].sort(tri) });
      continue;
    }
    // Ingrédients : dans l'étape appariée, par ingredientKey + unité.
    const candidats = ingredientsCourants.filter((it) => it.batch_step_id === id);
    const pris = new Set<number>();
    const rs = g.remarques.map((r) => {
      if (r.nature !== 'ingredient') return r;
      const k = ingredientKey(r.libelle);
      const u = uniteCle(r.unite);
      const m = candidats.find((it) => !pris.has(it.id) && ingredientKey(it.name) === k && uniteCle(it.unit) === u);
      if (m) pris.add(m.id);
      return { ...r, ingredientId: m?.id ?? null };
    });
    const titreCourant = steps.find((s) => s.id === id)?.title ?? g.titre ?? 'Étape';
    const existant = parEtape[id];
    parEtape[id] = { titre: titreCourant, remarques: [...(existant?.remarques ?? []), ...rs].sort(tri) };
  }
  return { parEtape, autres, generales };
}

// Nombre d'étapes porteuses d'une remarque (encadré du lancement).
export function nombreEtapesAnnotees(remarques: Remarque[]): number {
  const etapes = new Set(remarques.filter((r) => r.etapeId != null || r.etapeTitre).map((r) => `${r.batchId}:${r.etapeId ?? r.etapeTitre}`));
  return etapes.size;
}

// La fournée « courante » vue comme une fournée de référence (résumé).
export function versReference(b: {
  id: number;
  date_fin: string | null;
  planned_date: string | null;
  commentaire_global: string | null;
  batch_steps: RefStep[];
  batch_ingredients: RefIngredient[];
}): FourneeReference {
  return {
    id: b.id,
    date: b.date_fin ?? b.planned_date,
    commentaire_global: b.commentaire_global,
    lecon: lireLecon(b),
    batch_steps: b.batch_steps,
    batch_ingredients: b.batch_ingredients,
  };
}

// Ligne à écrire dans `remarques_gardees` pour une remarque.
export function ligneDecision(r: Remarque, statut: StatutRemarque): DecisionRemarque {
  return {
    nature: r.nature,
    ligne_id: r.ligneId,
    statut,
    batch_id: r.batchId,
    fournee_du: r.date,
    etape_id: r.etapeId,
    etape_titre: r.etapeTitre,
    source_step_id: r.sourceStepId,
    ordre: r.ordre,
    libelle: r.libelle,
    unite: r.unite,
    texte: r.texte,
    ecart: r.ecart,
  };
}

// « 12/09 » — date courte.
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
