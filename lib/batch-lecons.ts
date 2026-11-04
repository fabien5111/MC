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
  // Quantité obtenue à cette étape, en grammes, par rapport à ce qu'il
  // fallait : > 0 = en trop, < 0 = manquante (`batch_steps.ecart_produit_g`,
  // colonne posée par psql — absente avant la migration : `undefined`).
  ecart_produit_g?: number | null;
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
  // Ligne retirée à la main de la fournée : hors de la masse de l'étape.
  removed?: boolean;
};
export type FourneeReference = {
  id: number;
  // Date de clôture (`date_fin`), à défaut date prévue.
  date: string | null;
  commentaire_global: string | null;
  // `batches.lecon` — absente avant la migration : `null`.
  lecon: string | null;
  // Coefficient de la fournée (`batches.factor`) ; absent/nul = ×1.
  facteur?: number | null;
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
  // Ingrédients seulement : coefficient de la fournée, quantité prévue (déjà
  // multipliée par le coefficient) et quantité réellement utilisée.
  facteur?: number | null;
  prevu?: number | null;
  reel?: number | null;
  // Étapes seulement : quantité obtenue par rapport à ce qu'il fallait, en
  // grammes (> 0 en trop, < 0 manquante), masse des ingrédients pesables de
  // l'étape telle que réalisée (quantité réelle, sinon prévue) et nombre de
  // lignes non pesables (hors g / kg / mg), qui n'y sont pas comptées.
  ecartProduit?: number | null;
  masseFournee?: number | null;
  nonPesees?: number;
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

// ── Quantité obtenue (écart de production d'une étape) ──────────────────
// Le membre note en fournée que l'étape a produit « 50 g de trop » : un
// nombre, pas une phrase, pour que l'éditeur de la recette (et le mode projet)
// puisse en tirer un coefficient d'ajustement des ingrédients de l'étape.

// Valeur à écrire dans `batch_steps.ecart_produit_g` : grammes signés,
// arrondis au gramme ; vide, nul ou illisible → `null`.
export function normaliserEcartProduit(grammes: string, sens: 'trop' | 'manque'): number | null {
  const v = nombre(grammes);
  if (v == null || v <= 0) return null;
  const g = Math.round(v);
  if (!g) return null;
  return sens === 'trop' ? g : -g;
}

// « 50 g en trop » / « 30 g manquants ».
export function libelleEcartProduit(g: number | null | undefined): string | null {
  if (g == null || !isFinite(g) || g === 0) return null;
  const n = fmtNum(Math.abs(g));
  return g > 0 ? `${n} g en trop` : `${n} g manquant${Math.abs(g) > 1 ? 's' : ''}`;
}

// Lecture tolérante d'une quantité (« 50,5 », 50.5) ; tout autre texte
// (« 1 pincée », « 1 + 2 ») est ignoré plutôt que lu à moitié.
export function nombre(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = v.trim();
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  return parseFloat(s.replace(',', '.'));
}

const VERS_GRAMMES: Record<string, number> = { g: 1, gr: 1, gramme: 1, grammes: 1, kg: 1000, mg: 0.001 };

// Masse des lignes pesables (g, kg, mg) et nombre de lignes qui ne le sont
// pas (unités, volumes, quantités non chiffrées) : aucune conversion par
// masse volumique — les deux côtés d'une comparaison suivent la même règle,
// c'est ce qui compte pour un rapport.
export function masseGrammes(lignes: { quantity: string | number | null; unit: string | null }[]): { grammes: number; nonPesees: number } {
  let grammes = 0;
  let nonPesees = 0;
  for (const l of lignes) {
    const q = nombre(l.quantity);
    const k = VERS_GRAMMES[uniteCle(l.unit)];
    if (q == null || q <= 0 || k == null) {
      if (q != null || texte(typeof l.quantity === 'string' ? l.quantity : null)) nonPesees++;
      continue;
    }
    grammes += q * k;
  }
  return { grammes: Math.round(grammes * 100) / 100, nonPesees };
}

// Coefficient à appliquer aux ingrédients ACTUELS de l'étape pour obtenir ce
// qu'il fallait : la masse visée est celle de la fournée moins l'écart,
// ramenée à coefficient 1 (une fournée ×1,5 a produit une fois et demie la
// recette), puis comparée à la masse actuelle — un calcul en masse absolue,
// juste même si les quantités ont été retouchées depuis la fournée.
// `null` : rien à calculer (pas d'écart, masse inconnue, cible nulle).
export function coefficientEcart(r: Pick<Remarque, 'ecartProduit' | 'masseFournee' | 'facteur'>, masseCourante: number): number | null {
  if (!r.ecartProduit || !r.masseFournee || r.masseFournee <= 0 || !(masseCourante > 0)) return null;
  const f = r.facteur && r.facteur > 0 ? r.facteur : 1;
  const cible = (r.masseFournee - r.ecartProduit) / f;
  if (!(cible > 0)) return null;
  const coef = cible / masseCourante;
  return isFinite(coef) ? Math.round(coef * 1000) / 1000 : null;
}

// Quantité ajustée, arrondie comme on pèse : au gramme dès 20 g, au
// dixième en dessous ; deux décimales dans les autres unités.
export function arrondiQuantite(q: number, unite: string | null): number {
  const k = VERS_GRAMMES[uniteCle(unite)];
  if (k === 1 && q >= 20) return Math.round(q);
  if (k === 1) return Math.round(q * 10) / 10;
  return Math.round(q * 100) / 100;
}

const ORDRE_NATURE: Record<NatureRemarque, number> = { lecon: 0, global: 1, etape: 2, sous_etape: 3, ingredient: 4 };

// Toutes les remarques d'une fournée (sans décision).
export function remarquesDeFournee(ref: FourneeReference): Remarque[] {
  const out: Remarque[] = [];
  const base = { batchId: ref.id, date: ref.date, statut: null, libelle: null, unite: null, ecart: null, facteur: ref.facteur && ref.facteur > 0 ? ref.facteur : null } as const;
  const lecon = texte(ref.lecon);
  if (lecon) out.push({ ...base, cle: cleRemarque('lecon', ref.id), nature: 'lecon', ligneId: ref.id, etapeId: null, etapeTitre: null, sourceStepId: null, ordre: -2, texte: lecon });
  const glob = texte(ref.commentaire_global);
  if (glob) out.push({ ...base, cle: cleRemarque('global', ref.id), nature: 'global', ligneId: ref.id, etapeId: null, etapeTitre: null, sourceStepId: null, ordre: -1, texte: glob });
  const steps = [...ref.batch_steps].sort((a, b) => a.order_index - b.order_index);
  for (const s of steps) {
    const etape = { etapeId: s.id, etapeTitre: texte(s.title), sourceStepId: s.source_step_id, ordre: s.order_index };
    const c = texte(s.commentaire);
    const ecartProduit = s.ecart_produit_g && isFinite(s.ecart_produit_g) ? s.ecart_produit_g : null;
    if (c || ecartProduit) {
      const lignes = ref.batch_ingredients
        .filter((i) => i.batch_step_id === s.id && !i.removed)
        .map((i) => ({ quantity: i.real_quantity ?? i.quantity, unit: i.unit }));
      const m = masseGrammes(lignes);
      out.push({
        ...base, ...etape, cle: cleRemarque('etape', s.id), nature: 'etape', ligneId: s.id, texte: c,
        ecart: libelleEcartProduit(ecartProduit),
        ecartProduit,
        masseFournee: m.grammes || null,
        nonPesees: m.nonPesees,
        facteur: ref.facteur && ref.facteur > 0 ? ref.facteur : null,
      });
    }
    for (const su of [...(s.batch_substeps ?? [])].sort((a, b) => a.order_index - b.order_index)) {
      const cs = texte(su.commentaire);
      if (cs) out.push({ ...base, ...etape, cle: cleRemarque('sous_etape', su.id), nature: 'sous_etape', ligneId: su.id, libelle: su.texte, texte: cs });
    }
    for (const it of ref.batch_ingredients.filter((i) => i.batch_step_id === s.id).sort((a, b) => a.order_index - b.order_index)) {
      const ci = texte(it.commentaire);
      const ecart = ecartQuantite(it);
      if (ci || ecart) {
        out.push({
          ...base, ...etape, cle: cleRemarque('ingredient', it.id), nature: 'ingredient', ligneId: it.id, libelle: it.name, unite: it.unit, texte: ci, ecart,
          facteur: ref.facteur && ref.facteur > 0 ? ref.facteur : null,
          prevu: it.quantity,
          reel: it.real_quantity,
        });
      }
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

// `sousEtapes` (facultatif) : texte des sous-étapes actuelles de l'étape. Fourni,
// il permet d'écarter les retours d'une sous-étape qui n'existe plus.
export type EtapeCourante = { id: number; source_step_id: number | null; title: string | null; order_index: number; sousEtapes?: string[] };
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
    const courante = steps.find((s) => s.id === id);
    // Une ligne supprimée de l'étape n'a plus de raison de rappeler son retour :
    // sous-étape absente (texte comparé sans casse ni accents), ingrédient dont
    // le nom ne figure plus dans l'étape (une unité changée le garde).
    const textes = courante?.sousEtapes?.map((t) => normSearch(t).trim());
    const gardees = rs.filter((r) => {
      if (r.nature === 'sous_etape' && textes) return textes.includes(normSearch(r.libelle ?? '').trim());
      if (r.nature === 'ingredient' && ingredientsCourants.length > 0) return r.ingredientId != null || candidats.some((it) => ingredientKey(it.name) === ingredientKey(r.libelle));
      return true;
    });
    if (!gardees.length) continue;
    const titreCourant = courante?.title ?? g.titre ?? 'Étape';
    const existant = parEtape[id];
    parEtape[id] = { titre: titreCourant, remarques: [...(existant?.remarques ?? []), ...gardees].sort(tri) };
  }
  return { parEtape, autres, generales };
}

// Fenêtre d'édition d'une préparation : rattache chaque ligne COURANTE (sous-
// étape, ingrédient) à la ligne d'ORIGINE qu'elle était à l'ouverture, pour que
// son retour de fournée reste dessous pendant qu'on la corrige — rattaché au
// texte courant, il disparaissait dès la première lettre tapée. Les lignes
// identiques d'abord (dans l'ordre), puis ce qui reste d'un côté et de l'autre,
// pris dans l'ordre : une ligne retouchée prend la place de son original. Une
// ligne ajoutée (plus de lignes courantes que d'origines) n'a pas d'origine.
// Retour : pour chaque ligne courante, l'indice de son origine, ou `null`.
export function apparier(courantes: string[], origines: string[]): (number | null)[] {
  const res: (number | null)[] = courantes.map(() => null);
  const prises = new Set<number>();
  courantes.forEach((c, i) => {
    const k = origines.findIndex((o, j) => !prises.has(j) && o === c);
    if (k >= 0) {
      res[i] = k;
      prises.add(k);
    }
  });
  const libres = origines.map((_, j) => j).filter((j) => !prises.has(j));
  let n = 0;
  courantes.forEach((_, i) => {
    if (res[i] == null && n < libres.length) res[i] = libres[n++];
  });
  return res;
}

// Éditeur de recette : l'écart de quantité d'un ingrédient, avec le coefficient
// de la fournée et la quantité ramenée à un coefficient 1.
//   « ×1,5 : 180 g utilisés (120 g à coefficient 1) »
// Sans coefficient connu ou à ×1, le libellé d'écart ordinaire est repris ;
// sans quantité réelle, la quantité prévue est donnée de la même façon.
export function libelleCoefficient(r: Pick<Remarque, 'facteur' | 'prevu' | 'reel' | 'unite' | 'ecart'>): string | null {
  const f = r.facteur && r.facteur > 0 ? r.facteur : 1;
  const u = texte(r.unite) ? ' ' + texte(r.unite) : '';
  const utilise = r.reel != null && r.prevu != null && Math.abs(r.reel - r.prevu) >= 1e-9;
  if (f === 1) return utilise ? r.ecart : null;
  const q = utilise ? r.reel : r.prevu;
  if (q == null) return null;
  const mot = utilise ? 'utilisés' : 'prévus';
  return `×${fmtNum(f)} : ${fmtNum(q)}${u} ${mot} (${fmtNum(q / f)}${u} à coefficient 1)`;
}

// Éditeur de recette : remarques de sous-étape d'une étape appariée, pour une
// sous-étape donnée (même texte, casse et accents ignorés).
export function remarquesDeSousEtape(constat: ConstatEtape | undefined, texteSousEtape: string): Remarque[] {
  const t = normSearch(texteSousEtape).trim();
  if (!t || !constat) return [];
  return constat.remarques.filter((r) => r.nature === 'sous_etape' && normSearch(r.libelle ?? '').trim() === t);
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
  factor?: number | null;
  batch_steps: RefStep[];
  batch_ingredients: RefIngredient[];
}): FourneeReference {
  return {
    id: b.id,
    date: b.date_fin ?? b.planned_date,
    commentaire_global: b.commentaire_global,
    lecon: lireLecon(b),
    facteur: b.factor && b.factor > 0 ? b.factor : null,
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

// « (×1,5) » à la suite de la date d'une fournée : son coefficient, quand il est
// connu (les remarques gardées de l'ancien modèle n'en portent pas).
export function coefFournee(r: Pick<Remarque, 'facteur'>): string {
  return r.facteur && r.facteur > 0 ? ` (coef ×${fmtNum(r.facteur)})` : '';
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
