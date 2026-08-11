// Critères de la recherche avancée ⇄ URL. Fonctions pures — aucun accès
// Supabase : utilisables côté serveur (app/recherche/page.tsx lit ses
// searchParams) comme côté client (les facettes réécrivent l'URL).
//
// L'URL est la seule source de vérité de l'écran : rechargement, partage de
// lien et retour arrière restituent exactement la même recherche, et le rendu
// des résultats reste entièrement côté serveur (pas de store global, pas de
// seconde grille rendue côté client).

export const SORT_KEYS = ['relevance', 'recent', 'rating', 'quick'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Pertinence',
  recent: 'Plus récentes',
  rating: 'Mieux notées',
  quick: 'Les plus rapides',
};

// Curseur « Temps total » : 30 min → 8 h par pas de 30. La butée haute vaut
// « sans limite » (libellé « 8 h et + » de la maquette), pas « exactement
// 8 h » — sinon le réglage par défaut écarterait les recettes longues.
export const TIME_MIN = 30;
export const TIME_MAX = 480;
export const TIME_STEP = 30;

// Cartes chargées par palier (« Charger plus »).
export const PAGE_SIZE = 12;

export type IngredientMode = 'inc' | 'exc';

export type SearchCriteria = {
  q: string;
  inc: string[]; // ingrédients à inclure (tous requis)
  exc: string[]; // ingrédients à exclure (aucun toléré)
  type: string | null; // slug de recipe_types
  diff: number[]; // niveaux de difficulté (1..5), cumulables
  tmax: number | null; // minutes ; null = sans limite
  cat: string[]; // slugs de tags
  allerg: string[]; // noms d'allergènes à exclure
  minRecipeRating: number | null;
  minAuthorRating: number | null;
  sort: SortKey;
  shown: number; // nombre de cartes affichées (pagination « Charger plus »)
  // Sur quoi porte la recherche — recettes, pâtissiers, ou les deux (cochés
  // par défaut). Ce n'est pas une facette de recette comme les autres (pas de
  // puce retirable, pas compté dans countActiveCriteria) : ça change la
  // *nature* des résultats, pas les recettes qui les composent.
  includeRecipes: boolean;
  includeAuthors: boolean;
};

export const EMPTY_CRITERIA: SearchCriteria = {
  q: '',
  inc: [],
  exc: [],
  type: null,
  diff: [],
  tmax: null,
  cat: [],
  allerg: [],
  minRecipeRating: null,
  minAuthorRating: null,
  sort: 'relevance',
  shown: PAGE_SIZE,
  includeRecipes: true,
  includeAuthors: true,
};

// Normalisation souple (casse + accents + espaces), même règle que
// `normAllergen` de lib/recipe-view.ts. Sert au dédoublonnage des ingrédients
// et à l'exclusion mutuelle inclus/exclu — la base applique la même
// normalisation via `public.mc_norm()`.
export function normLoose(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeLoose(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const value = v.trim();
    if (!value) continue;
    const key = normLoose(value);
    if (key && !seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
const asList = (v: string | string[] | undefined): string[] =>
  first(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Paramètre numérique absent → null, et non zéro. `Number('')` vaut `0` : sans
// ce garde-fou, une URL sans paramètre se lisait comme « temps ≤ 30 min » et
// « note ≥ 1 étoile », deux critères que personne n'avait demandés.
function asNumber(v: string | string[] | undefined): number | null {
  const raw = first(v).trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Lecture des critères depuis les searchParams de la page.
//
// `category` (lien de catégorie de l'accueil) est accepté comme alias de
// `cat` et fusionné avec lui : les liens existants continuent de fonctionner
// et arrivent directement dans l'écran de recherche avancée, sans redirection.
export function parseSearchCriteria(sp: RawParams): SearchCriteria {
  const sort = SORT_KEYS.includes(first(sp.sort) as SortKey) ? (first(sp.sort) as SortKey) : 'relevance';

  const diff = dedupeLoose(asList(sp.diff))
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);

  const tmaxRaw = asNumber(sp.tmax);
  const tmax =
    tmaxRaw === null ? null : clamp(Math.round(tmaxRaw / TIME_STEP) * TIME_STEP, TIME_MIN, TIME_MAX);

  const rr = asNumber(sp.min_rr);
  const ar = asNumber(sp.min_ar);

  const shownRaw = asNumber(sp.n);
  const shown = shownRaw === null ? PAGE_SIZE : clamp(Math.round(shownRaw), PAGE_SIZE, 240);

  // `ir=0` / `ia=0` décochent respectivement Recettes / Pâtissiers ; absent =
  // coché (comportement par défaut). Les deux décochés à la fois ne mènent à
  // aucun résultat possible — une URL trafiquée (`?ir=0&ia=0`) retombe donc
  // sur les deux cochés, même règle que le statut du carnet sur une URL
  // incohérente (cf. lib/carnet-params.ts).
  let includeRecipes = first(sp.ir) !== '0';
  let includeAuthors = first(sp.ia) !== '0';
  if (!includeRecipes && !includeAuthors) {
    includeRecipes = true;
    includeAuthors = true;
  }

  return {
    q: first(sp.q).trim(),
    inc: dedupeLoose(asList(sp.inc)),
    exc: dedupeLoose(asList(sp.exc)),
    type: first(sp.type).trim() || null,
    diff: [...new Set(diff)].sort((a, b) => a - b),
    tmax,
    cat: dedupeLoose([...asList(sp.cat), ...asList(sp.category)]),
    allerg: dedupeLoose(asList(sp.allerg)),
    minRecipeRating: rr === null ? null : clamp(Math.round(rr), 1, 5),
    // Même principe que la note de la recette : entier 1..5, 0 ou absent =
    // pas de filtre.
    minAuthorRating: ar === null || ar <= 0 ? null : clamp(Math.round(ar), 1, 5),
    sort,
    shown,
    includeRecipes,
    includeAuthors,
  };
}

// Écriture des critères dans l'URL. Les valeurs par défaut sont omises pour
// garder des liens partageables lisibles.
export function criteriaToParams(c: SearchCriteria): URLSearchParams {
  const p = new URLSearchParams();
  if (c.q) p.set('q', c.q);
  if (c.inc.length) p.set('inc', c.inc.join(','));
  if (c.exc.length) p.set('exc', c.exc.join(','));
  if (c.type) p.set('type', c.type);
  if (c.diff.length) p.set('diff', c.diff.join(','));
  if (c.tmax !== null && c.tmax < TIME_MAX) p.set('tmax', String(c.tmax));
  if (c.cat.length) p.set('cat', c.cat.join(','));
  if (c.allerg.length) p.set('allerg', c.allerg.join(','));
  if (c.minRecipeRating !== null) p.set('min_rr', String(c.minRecipeRating));
  if (c.minAuthorRating !== null) p.set('min_ar', String(c.minAuthorRating));
  if (c.sort !== 'relevance') p.set('sort', c.sort);
  if (c.shown > PAGE_SIZE) p.set('n', String(c.shown));
  if (!c.includeRecipes) p.set('ir', '0');
  if (!c.includeAuthors) p.set('ia', '0');
  return p;
}

export function criteriaToQueryString(c: SearchCriteria): string {
  return criteriaToParams(c).toString();
}

// Nombre de critères actifs — alimente la pastille de la colonne (desktop) et
// du bouton « Filtres » (mobile). Masquée à zéro : on n'affiche jamais « 0 ».
// Le terme de recherche et le tri ne sont pas des critères de facette et ne
// sont donc pas comptés.
export function countActiveCriteria(c: SearchCriteria): number {
  return (
    c.inc.length +
    c.exc.length +
    c.diff.length +
    c.cat.length +
    c.allerg.length +
    (c.type ? 1 : 0) +
    (c.tmax !== null && c.tmax < TIME_MAX ? 1 : 0) +
    (c.minRecipeRating !== null ? 1 : 0) +
    (c.minAuthorRating !== null ? 1 : 0)
  );
}

// Vrai dès qu'une recherche a été formulée (terme ou facette) : distingue
// l'écran d'accueil de la recherche d'un résultat réellement vide.
export function hasAnySearch(c: SearchCriteria): boolean {
  return !!c.q || countActiveCriteria(c) > 0;
}

// « Réinitialiser » : on ne remet à zéro que les facettes. Le terme saisi, le
// tri et la portée recettes/pâtissiers restent — les effacer aussi ferait
// disparaître les résultats, ou le choix de portée, sous les doigts de
// l'utilisateur.
export function resetFacets(c: SearchCriteria): SearchCriteria {
  return {
    ...EMPTY_CRITERIA,
    q: c.q,
    sort: c.sort,
    includeRecipes: c.includeRecipes,
    includeAuthors: c.includeAuthors,
  };
}

// Ajout d'un ingrédient dans l'un des deux modes. Un même ingrédient ne peut
// pas être simultanément inclus et exclu : l'ajout dans un mode le retire de
// l'autre, plutôt que de laisser coexister deux critères contradictoires.
export function addIngredient(c: SearchCriteria, term: string, mode: IngredientMode): SearchCriteria {
  const value = term.trim();
  if (!value) return c;
  const key = normLoose(value);
  const inc = c.inc.filter((i) => normLoose(i) !== key);
  const exc = c.exc.filter((i) => normLoose(i) !== key);
  return mode === 'inc' ? { ...c, inc: [...inc, value], exc } : { ...c, inc, exc: [...exc, value] };
}

export function removeIngredient(c: SearchCriteria, term: string): SearchCriteria {
  const key = normLoose(term);
  return {
    ...c,
    inc: c.inc.filter((i) => normLoose(i) !== key),
    exc: c.exc.filter((i) => normLoose(i) !== key),
  };
}

// Bascule d'une valeur dans une liste (catégories, allergènes, difficultés).
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Libellé du curseur de temps.
export function timeLabel(tmax: number | null): string {
  if (tmax === null || tmax >= TIME_MAX) return 'sans limite';
  if (tmax < 60) return `jusqu'à ${tmax} min`;
  const h = Math.floor(tmax / 60);
  const m = tmax % 60;
  return m ? `jusqu'à ${h} h ${m}` : `jusqu'à ${h} h`;
}

export function ratingLabel(value: number | null): string {
  if (value === null) return 'toutes les notes';
  return `${String(value).replace('.', ',')} étoile${value > 1 ? 's' : ''} et plus`;
}
