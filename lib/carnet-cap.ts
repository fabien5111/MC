// Carnet de recettes du CAP Pâtissier (JEP-6) — logique pure.
//
// Les consignes nationales de l'examen (EP1/EP2) n'autorisent dans le carnet
// du candidat que les **ingrédients et leurs quantités** : aucune technique,
// aucun processus, aucune température, aucune « autre précision ». Un carnet
// non conforme est retiré par le jury pour toute l'épreuve.
//
// D'où la règle de ce module : il construit la fiche par LISTE BLANCHE. Seuls
// sortent le titre, le rendement (« pour 8 personnes », « Ø 22 cm » — admis
// par les exemples officiels), le nom de chaque préparation, puis le nom, la
// quantité et l'unité de chaque ingrédient. Le commentaire d'un ingrédient
// (« température ambiante », « fondu »), ses allergènes, les notes de
// rendement, les étapes, les temps et les photos n'y entrent jamais : un champ
// ajouté plus tard à la recette ne peut donc pas fuir sur la feuille par
// oubli. Les pages d'impression ne rendent que ce que ce module renvoie.
//
// Pur (aucun accès base, aucun `next/headers`) : utilisé par les pages
// serveur et par l'aperçu client.
import type { RecipeFull, UserRecipeCard } from '@/lib/recipes';
import type { CarnetItem } from '@/lib/carnet';
import { isProjectDraft } from '@/lib/projects';
import type { BatchFull } from '@/lib/recipe-plan';
import { ingredientKey } from '@/lib/ingredient-name';
import { UNITS_LBL } from '@/lib/recipe-view';

export type CapLigne = { nom: string; quantite: string; unite: string };
export type CapPreparation = { cle: string; nom: string; lignes: CapLigne[] };
// `categorie` : nom du tag « [CAP] … » privé de la marque (cf. `categorieCap`) ;
// `null` pour une fournée ou une recette sans autre tag.
export type CapFiche = {
  cle: string;
  titre: string;
  rendement: string | null;
  categorie: string | null;
  preparations: CapPreparation[];
};

const nombre = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return parseFloat(t);
};
const fmt = (n: number): string => String(+n.toFixed(2)).replace('.', ',');

// « 1.5 » → « 1,5 » ; un texte libre (« QS », « 1 sachet ») reste tel quel.
export function quantiteCap(q: string | number | null | undefined): string {
  if (q == null) return '';
  const s = String(q).trim();
  const n = nombre(s);
  return n == null ? s : fmt(n);
}

// Unité affichée : « unité(s) » / « pièce(s) » n'apportent rien (« Œufs 3 »,
// comme dans les exemples officiels) ; le reste est gardé tel que saisi.
export function uniteCap(u: string | null | undefined): string {
  const s = (u || '').trim();
  if (/^(unit[eé]s?|unit[eé]\(s\)|pi[eè]ces?|pi[eè]ce\(s\))$/i.test(s)) return '';
  return s;
}

// Une préparation = une liste de lignes. Le même ingrédient dans la même unité
// n'y figure qu'une fois (règle de l'examen : « quantités données une seule
// fois par recette ») — 20 g puis 60 g de sucre deviennent 80 g. Deux unités
// différentes restent sur deux lignes : on n'additionne jamais sans conversion.
export function lignesCap(items: { name: string | null; quantity: string | number | null; unit: string | null }[]): CapLigne[] {
  const out: (CapLigne & { cle: string })[] = [];
  for (const it of items) {
    const nom = (it.name || '').trim();
    if (!nom) continue;
    const unite = uniteCap(it.unit);
    const quantite = quantiteCap(it.quantity);
    const cle = ingredientKey(nom) + '|' + unite.toLowerCase();
    const ex = out.find((l) => l.cle === cle);
    const a = ex ? nombre(ex.quantite) : null;
    const b = nombre(quantite);
    if (ex && a != null && b != null) {
      ex.quantite = fmt(a + b);
      continue;
    }
    out.push({ cle, nom, quantite, unite });
  }
  return out.map(({ nom, quantite, unite }) => ({ nom, quantite, unite }));
}

// Rendement : uniquement la quantité produite ou le moule (« 8 pers. »,
// « Ø 22 cm — cercle »). `yield_notes`, texte libre où l'on écrit volontiers
// « perte de cuisson », « à pocher en 10 », n'y entre jamais.
export function rendementCap(src: {
  measure_type: string | null;
  yield_qty: string | null;
  yield_unit: string | null;
  yield_desc: string | null;
  moule: string | null;
}): string | null {
  if (src.measure_type === 'units' && src.yield_qty) {
    const u = UNITS_LBL[src.yield_unit || ''] || src.yield_unit || '';
    return `${src.yield_qty} ${u}`.trim();
  }
  if (src.measure_type === 'mold') {
    const v = [src.yield_desc, src.moule].filter(Boolean).join(' — ');
    return v || null;
  }
  if (src.measure_type === 'dimensions' && src.yield_desc) return src.yield_desc;
  return null;
}

const MOULES: Record<string, string> = { cercle: 'cercle', manque: 'moule à manqué', cadre: 'cadre rectangulaire' };

/**
 * Fiche CAP d'une recette. `composants` (mode projet : id → nom de la
 * préparation) regroupe les groupes d'ingrédients d'un même composant sous
 * son nom (« Biscuit joconde ») ; sans lui, chaque groupe d'ingrédients — donc
 * chaque étape — est une préparation, nommée comme l'étape.
 */
export function ficheCapRecette(recipe: RecipeFull, composants?: Map<number, string>): CapFiche {
  const composantParOrdre = new Map<number, number>();
  for (const s of recipe.recipe_steps || []) {
    const cid = (s as { component_id?: number | null }).component_id;
    if (cid != null && composants?.has(cid)) composantParOrdre.set(s.order_index || 0, cid);
  }
  const groupes = [...(recipe.ingredient_groups || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const preparations: { cle: string; nom: string; items: RecipeFull['ingredient_groups'][number]['ingredients'] }[] = [];
  for (const g of groupes) {
    const items = [...(g.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const cid = composantParOrdre.get(g.order_index || 0);
    const cle = cid != null ? `c${cid}` : `g${g.id}`;
    const ex = preparations.find((p) => p.cle === cle);
    if (ex) ex.items.push(...items);
    else preparations.push({ cle, nom: (cid != null ? composants!.get(cid) : g.name)?.trim() || '', items: [...items] });
  }
  return {
    cle: recipe.id,
    titre: recipe.title,
    categorie: categorieCap(recipe.recipe_tags),
    rendement: rendementCap({
      measure_type: recipe.measure_type,
      yield_qty: recipe.yield_qty,
      yield_unit: recipe.yield_unit,
      yield_desc: recipe.yield_desc,
      moule: recipe.mold_types?.name || MOULES[recipe.yield_unit || ''] || null,
    }),
    preparations: nommer(
      preparations.map((p) => ({ cle: p.cle, nom: p.nom, lignes: lignesCap(p.items) })),
    ),
  };
}

/**
 * Fiche CAP d'une fournée : les quantités AJUSTÉES de la fournée, sur une
 * seule colonne (c'est précisément ce qu'interdit l'examen : plusieurs
 * volumes côte à côte). Sont écartées les lignes qui ne font plus partie de
 * la recette réalisée — retirées à la main, remplacées par une sous-recette
 * (ses propres ingrédients arrivent par les étapes insérées), ou portées par
 * une étape entièrement remplacée. Une étape « déjà faite » garde ses
 * ingrédients : le carnet décrit la recette, pas l'avancement.
 */
export function ficheCapFournee(batch: BatchFull): CapFiche {
  const etapes = [...batch.batch_steps].sort((a, b) => a.order_index - b.order_index);
  const preparations = etapes.map((s) => ({
    cle: `s${s.id}`,
    nom: (s.title || '').trim(),
    lignes: s.replaced_by_recipe_id
      ? []
      : lignesCap(
          batch.batch_ingredients
            .filter((it) => it.batch_step_id === s.id && !it.removed && !it.expanded_into_recipe_id)
            .sort((a, b) => a.order_index - b.order_index)
            .map((it) => ({ name: it.name, quantity: it.quantity ?? it.quantity_text, unit: it.unit })),
        ),
  }));
  return {
    cle: `fournee-${batch.id}`,
    titre: batch.recipe_title || 'Fournée',
    categorie: null,
    rendement: rendementCap({
      measure_type: batch.measure_type,
      yield_qty: batch.yield_qty,
      yield_unit: batch.yield_unit,
      yield_desc: batch.yield_desc,
      moule: batch.mold_type_name || MOULES[batch.yield_unit || ''] || null,
    }),
    preparations: nommer(preparations),
  };
}

// Préparations sans ingrédient retirées (étape de cuisson, d'assemblage) ;
// une préparation sans nom en reçoit un neutre, à corriger dans l'aperçu.
function nommer(preps: CapPreparation[]): CapPreparation[] {
  return preps
    .filter((p) => p.lignes.length > 0)
    .map((p, i) => ({ ...p, nom: p.nom || `Préparation ${i + 1}` }));
}

// ── Poids total ───────────────────────────────────────────────────────────

const MASSES: Record<string, number> = { g: 1, gr: 1, gramme: 1, grammes: 1, kg: 1000 };

/**
 * Poids total d'une préparation, en grammes — seulement si TOUTES ses lignes
 * sont des masses chiffrées. Une ligne en pièces, en ml ou « QS » rendrait le
 * total faux : un total faux est pire qu'absent (même doctrine que les
 * compteurs de la recherche).
 */
export function poidsTotalCap(p: CapPreparation): number | null {
  let total = 0;
  for (const l of p.lignes) {
    const k = MASSES[l.unite.toLowerCase()];
    const n = nombre(l.quantite);
    if (!k || n == null) return null;
    total += n * k;
  }
  return p.lignes.length ? total : null;
}

export function fmtPoids(g: number): string {
  return g >= 1000 ? `${fmt(g / 1000)} kg` : `${fmt(Math.round(g))} g`;
}

// ── Garde-fou sur les noms de préparation ─────────────────────────────────
//
// Le nom d'une préparation vient du titre de l'étape (`CreerForm` réutilise ce
// titre pour le groupe d'ingrédients) : « Monter les blancs » ou « Cuire
// 20 min à 180 °C » décriraient une technique — exactement ce qui fait retirer
// un carnet. Repère indicatif (jamais bloquant) : un verbe de technique en
// tête, une température ou une durée.
const VERBES = new Set(
  (
    'abaisser ajouter assembler battre beurrer blanchir caraméliser chauffer chablonner chemiser clarifier ' +
    'concasser couler crémer cuire découper décorer démouler détailler détendre dorer dresser émulsionner ' +
    'étaler faire filmer finir foncer fondre fouetter fraiser garnir glacer hacher hydrater incorporer ' +
    'infuser laisser lisser macaronner malaxer mélanger mettre mixer monter mouler napper pétrir pocher ' +
    'porter préparer puncher réaliser refroidir réserver sabler saupoudrer tabler tamiser torréfier ' +
    'tourer verser zester'
  ).split(' '),
);

export function nomPreparationSuspect(nom: string): boolean {
  const t = nom.trim().toLowerCase();
  if (!t) return false;
  if (/\d\s*°|°\s*c\b|\b\d+\s*(min|minutes?|h|heures?|s|secondes?)\b/.test(t)) return true;
  const premier = t.split(/[\s'’,.:;-]+/)[0];
  return VERBES.has(premier);
}

// ── Rubrique « Carnet CAP » du carnet (JEP-6) ─────────────────────────────

// Convention de nommage : un tag dont le nom contient « [CAP] » donne la
// catégorie d'impression de la recette, le reste du nom étant cette catégorie
// (« [CAP] Crèmes » → « Crèmes »). Il ne décide plus de l'entrée dans la
// rubrique, qui est la liste CAP remplie à la main (JEP-376). Détecté sans
// casse ni accents.
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const RE_MARQUE_CAP = /\[\s*cap\s*\]/i;

export const estTagCap = (nom: string) => RE_MARQUE_CAP.test(norm(nom));

/**
 * Éléments d'une liste de recettes — la liste CAP ou une liste personnelle
 * (JEP-376) —, déjà filtrées par la RLS à la lecture. Une recette que le carnet
 * contient déjà garde son élément (marques favori / abonnement / partage, donc
 * sa carte et ses gestes habituels) ; les autres — recettes de la communauté
 * rangées dans la liste — sont des cartes « d'un autre » sans marque. Un projet en cours
 * n'y entre jamais (`isProjectDraft`, spec §10).
 */
export function itemsCap(
  recettes: UserRecipeCard[],
  carnet: CarnetItem[],
  userId: string,
): CarnetItem[] {
  const duCarnet = new Map(carnet.map((i) => [i.recipe.id, i]));
  const out: CarnetItem[] = [];
  for (const r of recettes) {
    if (isProjectDraft(r)) continue;
    const existant = duCarnet.get(r.id);
    if (existant) {
      out.push(existant);
    } else if (r.author_id === userId) {
      out.push({ kind: 'mine', recipe: r, favorite: false });
    } else {
      out.push({ kind: 'other', recipe: r, favorite: false, subscription: false, shared: null, status: null, publishedAt: r.created_at });
    }
  }
  return out;
}

// ── Catégories du carnet (JEP-6) ──────────────────────────────────────────

/**
 * Catégorie d'une recette : le nom de son tag « [CAP] … » privé de la marque
 * (« [CAP] Crèmes » → « Crèmes »). Plusieurs tags « [CAP] » : le premier par
 * ordre alphabétique, pour un résultat stable d'une impression à l'autre.
 * `null` sans tag « [CAP] » ou quand le tag est exactement « [CAP] ».
 */
export function categorieCap(tags: { tags: { name: string } | null }[] | null | undefined): string | null {
  const noms = (tags ?? [])
    .map((t) => t.tags?.name?.trim() ?? '')
    .filter((n) => n && estTagCap(n))
    .map((n) => n.replace(/\[\s*cap\s*\]/i, ' ').replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, ''))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return noms.find((n) => n) ?? null;
}

export type CapGroupe = { categorie: string | null; fiches: CapFiche[] };

/**
 * Fiches regroupées par catégorie, catégories dans l'ordre alphabétique et
 * « sans catégorie » en dernier ; l'ordre des fiches dans un groupe est
 * conservé (déjà alphabétique).
 */
export function grouperParCategorie(fiches: CapFiche[]): CapGroupe[] {
  const parCat = new Map<string | null, CapFiche[]>();
  for (const f of fiches) parCat.set(f.categorie, [...(parCat.get(f.categorie) ?? []), f]);
  return [...parCat.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'fr')))
    .map(([categorie, liste]) => ({ categorie, fiches: liste }));
}
