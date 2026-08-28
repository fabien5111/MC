// Normalisation du contenu d'une recette pour le contrôle IA à la validation
// des publications (spec « Contrôle IA à la validation des recettes »,
// étape 0 — §6.1). Fonctions pures, sans effet de bord : utilisables côté
// serveur comme côté client, à l'image de lib/recipe-plan.ts.
//
// Portée de ce lot : uniquement la normalisation (bloc rédactionnel + bloc
// structurel) et l'empreinte de contenu servant au cache. La modération
// (étape 1), la similarité interne (étape 2) et la recherche externe
// (étape 3) sont hors périmètre de ce lot.
import type { RecipeFull } from '@/lib/recipes';

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// --- Bloc rédactionnel (editorial_text) ------------------------------------

// Tournures pâtissières très fréquentes, sans valeur discriminante pour la
// similarité rédactionnelle (§6.1 : « stop-list [...] à constituer et à
// rendre configurable »). Liste volontairement courte pour ce lot : à
// enrichir depuis l'observation des premiers rapports plutôt que devinée.
const STOP_PHRASES = [
  "préchauffer le four à",
  "préchauffez le four à",
  "réserver au frais",
  "réservez au frais",
  "réserver au réfrigérateur",
  "réservez au réfrigérateur",
  "laisser refroidir",
  "laissez refroidir",
  "mélanger jusqu'à obtention d'une pâte homogène",
  "mélangez jusqu'à obtention d'une pâte homogène",
];

// Retire les quantités et unités d'un texte d'étape (« ajouter 200 g de
// farine » → « ajouter de la farine ») : la similarité rédactionnelle doit
// mesurer la formulation, pas des nombres communs à toute recette du même
// plat (§6.1).
function stripQuantities(text: string): string {
  return text
    .replace(
      /\b\d+([.,]\d+)?\s*(kg|g|mg|cl|ml|l|c\.?\s?à\s?s\.?|c\.?\s?à\s?c\.?|cuillères?\s+à\s+(soupe|café)|pincées?|gouttes?|feuilles?|unités?|pièces?|°c|min(?:utes?)?|h|heures?)\b/gi,
      ' ',
    )
    .replace(/\b\d+([.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripStopPhrases(text: string): string {
  let t = text;
  for (const phrase of STOP_PHRASES) {
    t = t.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  return t;
}

// Concaténation normalisée : titre + description + toutes les étapes (titre,
// description, sous-étapes, astuces) + notes/astuces de la recette.
// Minuscules, accents conservés (le sens y est porté, cf. §6.1), ponctuation
// et espaces multiples réduits.
export function buildEditorialText(recipe: RecipeFull): string {
  const parts: string[] = [];
  if (recipe.title) parts.push(recipe.title);
  if (recipe.description) parts.push(recipe.description);
  for (const step of recipe.recipe_steps ?? []) {
    if (step.title) parts.push(step.title);
    if (step.description) parts.push(step.description);
    for (const sub of step.sous_etapes ?? []) parts.push(sub);
    if (step.tips) parts.push(step.tips);
  }
  if (recipe.tips) parts.push(recipe.tips);

  const lowered = parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  return stripStopPhrases(stripQuantities(lowered)).replace(/\s+/g, ' ').trim();
}

// --- Bloc structurel (structural_signature) --------------------------------

export type StructuralIngredient = {
  // Nom canonique : identifiant du référentiel (`ingredient_refs.id`) quand
  // l'ingrédient y est rattaché — le rattachement fait déjà office de
  // mapping canonique (§6.1 : « mapping vers un référentiel »). À défaut, un
  // texte normalisé (minuscules, accents retirés) : une approximation qui ne
  // rapproche pas « sucre semoule » de « sucre en poudre » tant que les deux
  // ne sont pas rattachés au même `ingredient_refs.id` — limite du lot,
  // corrigée par la couverture croissante du référentiel plutôt que par un
  // dictionnaire de synonymes construit à la main ici.
  canonicalKey: string;
  massGrams: number | null;
  massPercent: number | null;
};

export type StructuralSignature = {
  ingredients: StructuralIngredient[];
  // Séquence ordonnée des verbes d'action principaux des étapes (premier mot
  // de chaque étape, normalisé) — signal simple et peu coûteux ; à affiner
  // si l'observation des rapports montre qu'il est trop bruité.
  actionSequence: string[];
};

// Grammes par unité, pour les ingrédients saisis dans une unité de masse ou
// de volume courante (approximation 1 ml ≈ 1 g pour les liquides). Ne
// s'appuie pas sur lib/ingredient-conversions.ts (conversions ingrédient par
// ingrédient, ex. « 1 œuf = 50 g ») : cette signature vise une estimation de
// la masse totale, pas l'affichage d'une équivalence précise. Un ingrédient
// hors de cette liste (pièces, pincées, gouttes...) est exclu du calcul de
// masse plutôt que d'introduire une estimation fausse silencieuse.
const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  kilogramme: 1000,
  kilogrammes: 1000,
  mg: 0.001,
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  cl: 10,
  l: 1000,
  litre: 1000,
  litres: 1000,
};

function normalizeUnit(unit: string): string {
  return stripAccents(unit.toLowerCase()).replace(/[.\s]/g, '');
}

function parseQuantity(v: string | null): number | null {
  if (!v) return null;
  const s = v.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toGrams(quantity: string | null, unit: string | null): number | null {
  const qty = parseQuantity(quantity);
  if (qty == null || qty <= 0 || !unit) return null;
  const factor = GRAMS_PER_UNIT[normalizeUnit(unit)];
  return factor != null ? qty * factor : null;
}

function canonicalIngredientKey(ing: { name: string; ref_id: number | null }): string {
  if (ing.ref_id != null) return `ref:${ing.ref_id}`;
  return `txt:${stripAccents(ing.name.toLowerCase()).replace(/\s+/g, ' ').trim()}`;
}

// Premier mot d'une étape, normalisé — proxy simple pour le verbe d'action
// principal du §6.1 (pas d'analyse grammaticale : « Faire fondre... » donne
// « faire », pas « fondre »).
function leadingVerb(stepText: string | null): string | null {
  if (!stepText) return null;
  const match = stripAccents(stepText.trim().toLowerCase()).match(/^[a-zà-ÿ]+/);
  return match ? match[0] : null;
}

export function buildStructuralSignature(recipe: RecipeFull): StructuralSignature {
  const rawIngredients = (recipe.ingredient_groups ?? []).flatMap((g) => g.ingredients ?? []);

  const withMass = rawIngredients.map((ing) => ({
    key: canonicalIngredientKey(ing),
    grams: toGrams(ing.quantity, ing.unit),
  }));

  const totalGrams = withMass.reduce((sum, i) => sum + (i.grams ?? 0), 0);

  // Un même ingrédient canonique peut apparaître dans plusieurs groupes (ex.
  // « beurre » dans la pâte et dans la garniture) : les masses sont cumulées
  // plutôt que de produire deux lignes concurrentes pour le même ingrédient.
  const byKey = new Map<string, number | null>();
  for (const item of withMass) {
    const prev = byKey.get(item.key);
    if (prev === undefined) byKey.set(item.key, item.grams);
    else if (item.grams != null) byKey.set(item.key, (prev ?? 0) + item.grams);
  }

  const ingredients: StructuralIngredient[] = Array.from(byKey.entries()).map(([canonicalKey, massGrams]) => ({
    canonicalKey,
    massGrams,
    massPercent: massGrams != null && totalGrams > 0 ? (massGrams / totalGrams) * 100 : null,
  }));

  const actionSequence = (recipe.recipe_steps ?? [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s) => leadingVerb(s.description))
    .filter((v): v is string => v != null);

  return { ingredients, actionSequence };
}

// --- Empreinte de contenu ---------------------------------------------------

// Empreinte du contenu analysé (`recipe_analysis.recipe_content_hash`) : une
// recette resoumise sans modification du texte rejoue l'analyse depuis le
// cache plutôt que de relancer l'IA et la recherche externe (§6.4, cas de
// test #11). Calculée sur le contenu brut (avant normalisation) pour que
// toute modification visible par l'utilisateur change l'empreinte, y compris
// un ingrédient rattaché ou détaché du référentiel.
export function recipeContentFingerprint(recipe: RecipeFull): string {
  const parts = [
    recipe.title ?? '',
    recipe.description ?? '',
    recipe.tips ?? '',
    ...(recipe.recipe_steps ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((s) => `${s.title ?? ''}|${s.description ?? ''}|${(s.sous_etapes ?? []).join(',')}|${s.tips ?? ''}`),
    ...(recipe.ingredient_groups ?? []).flatMap((g) =>
      (g.ingredients ?? []).map((i) => `${i.name}|${i.quantity ?? ''}|${i.unit ?? ''}|${i.ref_id ?? ''}`),
    ),
  ];
  return fnv1a(parts.join(' '));
}

// FNV-1a 32 bits, en hexadécimal : suffisant pour une clé de cache (aucune
// garantie cryptographique requise), sans dépendance à l'API `crypto` — dont
// la disponibilité diffère entre runtime Node et Edge.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
