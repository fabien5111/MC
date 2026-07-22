// Logique d'extraction/normalisation d'une recette importée (schéma pivot v1.0).
// Porté depuis api/import-url.js — fonctions pures, testables isolément.
import { callClaude, parseStrictJson } from '@/lib/ai/claude';

const SCHEMA_EXEMPLE = {
  schema_version: '1.0',
  titre: 'Entremets vanille-caramel',
  description: 'Un entremets léger sur biscuit madeleine.',
  categorie: 'entremets',
  tags: ['vanille', 'caramel'],
  difficulte: 3,
  temps: { preparation_min: 90, cuisson_min: 25, repos_min: 120, congelation_min: 720 },
  rendement: {
    type: 'moule',
    portions: 8,
    pieces: null,
    moule: {
      forme: 'rond',
      diametre_cm: 20,
      longueur_cm: null,
      largeur_cm: null,
      hauteur_cm: 4.5,
      volume_cm3: null,
      libelle: 'Cercle à entremets 20 cm',
    },
  },
  sous_preparations: [
    {
      ordre: 1,
      nom: 'Biscuit madeleine',
      day_offset: 2,
      ingredients: [
        { nom: 'beurre', quantite: 100, unite: 'g', texte_original: '100 g de beurre pommade', note: 'pommade', scaling: 'lineaire' },
        { nom: 'gélatine', quantite: 4, unite: 'g', texte_original: '2 feuilles de gélatine', note: 'feuilles de 2 g', scaling: 'lineaire_arrondi' },
      ],
      etapes: [
        { ordre: 1, texte: 'Crémer le beurre avec le sucre.', duree_min: null, temperature_c: null },
        { ordre: 2, texte: 'Cuire 25 min.', duree_min: 25, temperature_c: 170 },
      ],
      materiel: ['robot pâtissier', 'cercle 20 cm'],
    },
  ],
  notes: null,
  conseils_degustation: 'À déguster à température ambiante. Se conserve 3 jours au réfrigérateur dans une boîte hermétique.',
  source: {
    auteur_origine: 'Cyril Lignac',
    url_origine: 'https://exemple.fr/recette',
    video_url: 'https://www.youtube.com/watch?v=xxxx',
  },
  photos: [],
};

export const PROMPT = `Tu es un extracteur de recettes de pâtisserie. Analyse le contenu fourni
et renvoie UNIQUEMENT un objet JSON valide conforme au schéma ci-dessous,
sans texte avant ni après, sans balises markdown.

Règles :
- Découpe la recette en sous_preparations (biscuit, crémeux, glaçage…).
  S'il n'y en a qu'une, crée une seule sous-préparation nommée "Préparation".
- Normalise chaque quantité en g, ml ou piece. Conversions usuelles :
  1 c. à s. ≈ 15 ml, 1 c. à c. ≈ 5 ml, 1 feuille de gélatine = 2 g,
  1 œuf entier ≈ 50 g, 1 jaune ≈ 20 g, 1 blanc ≈ 30 g.
  Conserve toujours la formulation d'origine dans texte_original.
- Si une information est absente (temps, moule…), mets null. N'invente rien.
- Attribue scaling = "lineaire_arrondi" aux œufs et à la gélatine,
  "fixe" aux pincées et aux éléments de parfum, "lineaire" sinon.
- Si le moule est mentionné, remplis rendement.moule ; sinon rendement.type
  = "portions" avec le nombre indiqué, ou null.
- day_offset = nombre de jours AVANT la dégustation où l'on réalise la
  sous-préparation. Si la recette donne un planning (« J−2 : réaliser le
  sablé et les dacquoises ; J−1 : la mousse et le montage ; Jour J : le
  glaçage »), reporte le bon J−n sur CHAQUE sous-préparation concernée
  (J−2 → day_offset 2, J−1 → 1, Jour J → 0). Sans indication, mets 0.
- source.auteur_origine = nom du chef ou de l'auteur de la recette
  (ex. « Cyril Lignac »), sinon null.
- source.url_origine = URL de la page/recette d'origine si elle apparaît
  dans le contenu, sinon null.
- source.video_url = URL d'une vidéo de la recette (YouTube, etc.) si elle
  apparaît dans le contenu, sinon null.
- conseils_degustation = conseils de dégustation ET de conservation
  (température de service, durée et mode de conservation), en texte libre,
  sinon null. Ne les mélange pas avec les notes/astuces générales.

Schéma (exemple) : ${JSON.stringify(SCHEMA_EXEMPLE)}`;

const UNITES = new Set(['g', 'ml', 'piece']);

// Met une majuscule à la première lettre d'un libellé (le reste inchangé).
export function capitalize(s: string | null | undefined): string {
  const t = (s ?? '').toString();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Remplace le digramme « oe » par la ligature « œ » dans le mot « œuf(s) »
// (« oeuf » → « œuf », « d'Oeuf » → « d'Œuf »), en respectant la casse.
export function ligatureOeuf(s: string | null | undefined): string {
  const t = (s ?? '').toString();
  return t.replace(/oe(?=ufs?\b)/gi, (m) => (m[0] === 'O' ? 'Œ' : 'œ'));
}

// Nettoyage du pivot avant enregistrement :
//  - ligature « œuf » (« oeuf » → « œuf ») sur tous les textes ;
//  - majuscule initiale sur le nom des ingrédients et des ustensiles
//    (« jaune d'oeuf » → « Jaune d'œuf ») ;
//  - suppression de la note d'un ingrédient quand elle ne fait que répéter
//    son nom (cas fréquent où l'IA recopie le libellé dans `note`).
export function cleanPivotRecette(p: Pivot): void {
  if (!p || typeof p !== 'object') return;
  // Ligature « œuf » sur les textes généraux de la recette.
  for (const k of ['titre', 'description', 'notes', 'conseils_degustation']) {
    if (typeof p[k] === 'string') p[k] = ligatureOeuf(p[k]);
  }
  (p.sous_preparations || []).forEach((sp: Pivot) => {
    if (typeof sp.nom === 'string') sp.nom = ligatureOeuf(sp.nom);
    (sp.ingredients || []).forEach((ing: Pivot) => {
      if (typeof ing.nom === 'string') ing.nom = capitalize(ligatureOeuf(ing.nom).trim());
      if (typeof ing.texte_original === 'string') ing.texte_original = ligatureOeuf(ing.texte_original);
      const noteRaw = typeof ing.note === 'string' ? ligatureOeuf(ing.note).trim() : '';
      const nom = typeof ing.nom === 'string' ? ing.nom.trim() : '';
      ing.note = noteRaw && noteRaw.toLowerCase() !== nom.toLowerCase() ? noteRaw : null;
    });
    (sp.etapes || []).forEach((e: Pivot) => {
      if (typeof e.texte === 'string') e.texte = ligatureOeuf(e.texte);
    });
    if (Array.isArray(sp.materiel)) {
      sp.materiel = sp.materiel.map((m: unknown) => capitalize(ligatureOeuf(String(m ?? '')).trim())).filter(Boolean);
    }
  });
}

// ── Extraction depuis la page ────────────────────────────────
type LdRecipe = Record<string, unknown> & {
  recipeIngredient?: unknown;
  recipeInstructions?: unknown;
  author?: unknown;
};

export function extractLdRecipe(html: string): LdRecipe | null {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const findRecipe = (node: unknown): LdRecipe | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = findRecipe(n);
        if (r) return r;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return obj as LdRecipe;
    if (obj['@graph']) return findRecipe(obj['@graph']);
    return null;
  };
  while ((m = re.exec(html))) {
    try {
      const r = findRecipe(JSON.parse(m[1].trim()));
      if (r) return r;
    } catch {
      /* bloc invalide : on passe au suivant */
    }
  }
  return null;
}

export function ldEstComplet(ld: LdRecipe | null): boolean {
  if (!ld) return false;
  const ing = ld.recipeIngredient;
  const ins = ld.recipeInstructions;
  const aIng = Array.isArray(ing) ? ing.length > 0 : !!ing;
  const aIns = Array.isArray(ins) ? ins.length > 0 : !!ins;
  return aIng && aIns;
}

export function buildContenu(ld: LdRecipe | null, html: string, url: string): string {
  if (ldEstComplet(ld)) {
    return `Données schema.org "Recipe" extraites de ${url} :\n${JSON.stringify(ld)}`;
  }
  const texte = extractMainText(html);
  return ld
    ? `Données schema.org "Recipe" INCOMPLÈTES (sers-t'en pour le titre ou les temps, mais tire les ingrédients et les étapes du texte de la page) :\n${JSON.stringify(ld)}\n\nTexte de la page ${url} :\n${texte}`
    : `Texte de la page ${url} :\n${texte}`;
}

export function extractMainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 60000);
}

// ── Volume du moule (clé de voûte du scaling) ────────────────
export type Moule = {
  forme?: string;
  diametre_cm?: number;
  longueur_cm?: number;
  largeur_cm?: number;
  hauteur_cm?: number;
  volume_cm3?: number | null;
};

export function computeVolume(moule: Moule | null | undefined): number | null {
  if (!moule || typeof moule !== 'object') return null;
  const { forme, diametre_cm: d, longueur_cm: L, largeur_cm: l, hauteur_cm: h } = moule;
  if (forme === 'rond' && d! > 0 && h! > 0) return Math.round(Math.PI * (d! / 2) ** 2 * h!);
  if (['carre', 'rectangle', 'cadre'].includes(forme!) && L! > 0 && l! > 0 && h! > 0) {
    return Math.round(L! * l! * h!);
  }
  if (forme === 'buche' && l! > 0 && L! > 0) return Math.round((Math.PI * (l! / 2) ** 2 * L!) / 2);
  return moule.volume_cm3! > 0 ? Math.round(moule.volume_cm3!) : null;
}

// ── Validation (§4) ──────────────────────────────────────────
type Pivot = Record<string, any>;

export function validatePivot(p: Pivot): { erreurs: string[]; alertes: string[] } {
  const erreurs: string[] = [];
  const alertes: string[] = [];
  if (!p || typeof p !== 'object') return { erreurs: ['Objet JSON manquant.'], alertes };
  if (!p.titre || !String(p.titre).trim()) erreurs.push('Champ obligatoire manquant : titre.');
  if (!p.rendement || typeof p.rendement !== 'object') erreurs.push('Champ obligatoire manquant : rendement.');
  const sps: Pivot[] = Array.isArray(p.sous_preparations) ? p.sous_preparations : [];
  if (!sps.length) erreurs.push('Au moins une sous-préparation est requise.');
  let cuissonOuRepos =
    (p.temps && (p.temps.cuisson_min > 0 || p.temps.repos_min > 0 || p.temps.congelation_min > 0)) || false;
  sps.forEach((sp, i) => {
    const nom = sp.nom || `sous-préparation ${i + 1}`;
    const aIng = Array.isArray(sp.ingredients) && sp.ingredients.length > 0;
    const aEtapes = Array.isArray(sp.etapes) && sp.etapes.length > 0;
    if (!aIng && !aEtapes) erreurs.push(`« ${nom} » : ni ingrédient ni étape.`);
    else if (!aIng) alertes.push(`« ${nom} » : aucun ingrédient (montage ou assemblage ?) — à vérifier.`);
    else if (!aEtapes) alertes.push(`« ${nom} » : aucune étape — à vérifier.`);
    (sp.ingredients || []).forEach((ing: Pivot) => {
      if (ing.unite != null && !UNITES.has(ing.unite)) {
        erreurs.push(`« ${nom} » / ${ing.nom} : unité « ${ing.unite} » hors {g, ml, piece}.`);
      }
      if (ing.quantite != null && !(ing.quantite > 0)) {
        erreurs.push(`« ${nom} » / ${ing.nom} : quantité invalide (${ing.quantite}).`);
      }
      if (ing.quantite > 2000 && (ing.unite === 'g' || ing.unite === 'ml')) {
        alertes.push(`Quantité inhabituelle : ${ing.nom} — ${ing.quantite} ${ing.unite}.`);
      }
    });
    const ordres: number[] = (sp.etapes || []).map((e: Pivot) => e.ordre).filter((o: number) => o != null);
    const croissant = ordres.every((o, k) => k === 0 || o > ordres[k - 1]);
    if (ordres.length && !croissant) erreurs.push(`« ${nom} » : ordre des étapes incohérent.`);
    (sp.etapes || []).forEach((e: Pivot) => {
      if (e.temperature_c > 250) alertes.push(`Température élevée : ${e.temperature_c} °C (« ${nom} », étape ${e.ordre}).`);
      if (e.temperature_c != null || e.duree_min != null) cuissonOuRepos = true;
    });
  });
  if (!cuissonOuRepos) alertes.push('Aucune cuisson ni repos détecté : vérifiez la recette.');
  return { erreurs, alertes };
}

// ── Normalisation IA avec une relance (§4.1) ────────────────
export async function normalizeWithRetry(apiKey: string, contenu: string): Promise<Pivot> {
  const base = `${PROMPT}\n\nContenu à analyser :\n${contenu}`;
  let raw = await callClaude(apiKey, base, 8000);
  try {
    return parseStrictJson(raw) as Pivot;
  } catch (err) {
    raw = await callClaude(
      apiKey,
      `${base}\n\nTa réponse précédente n'était pas un JSON valide (erreur : ${(err as Error).message}). Renvoie UNIQUEMENT l'objet JSON corrigé.`,
      8000,
    );
    return parseStrictJson(raw) as Pivot;
  }
}
