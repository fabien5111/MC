// Logique d'extraction/normalisation d'une recette importée (schéma pivot v1.0).
// Porté depuis api/import-url.js — fonctions pures, testables isolément.
import { addUsage, callClaude, parseStrictJson, type ClaudeUsage } from '@/lib/ai/claude';

// ── Schéma d'extraction (sortie brute de l'IA) ───────────────
// Volontairement plat et concis : chaque clé superflue rallonge la génération,
// et c'est la durée de génération qui décide de tenir dans le `maxDuration` de
// la route. Les champs structurés absents ici (moule, difficulté, tags,
// catégorie) sont saisis à la relecture — cf. `toPivotInterne`.
export type IngredientIA = { nom?: string; quantite?: number | null; unite?: string | null };

export type EtapeIA = {
  nom_etape?: string;
  temps_preparation_minutes?: number | null;
  temps_attente_minutes?: number | null;
  temps_cuisson_minutes?: number | null;
  temperature_cuisson_celsius?: number | null;
  anticipation_jours?: number | null;
  ingredients?: IngredientIA[];
  instructions?: string[];
  conseils_etape?: string | null;
};

export type RecetteIA = {
  titre?: string;
  auteur_origine?: string | null;
  video_url?: string | null;
  description?: string | null;
  rendement?: string | null;
  ustensiles?: string[];
  etapes?: EtapeIA[];
  astuces_recette?: string[];
  conseils_conservation?: string | null;
};

export const PROMPT = `Tu es un expert culinaire. Extrais les informations de la recette fournie et renvoie le résultat UNIQUEMENT sous la forme d'un objet JSON valide. Ne génère aucun texte avant ou après le JSON.

Le JSON doit respecter scrupuleusement la structure et les clés suivantes :

{
  "titre": "Nom de la recette",
  "auteur_origine": "Nom de l'auteur ou source (null si non trouvé)",
  "video_url": "URL Youtube (null si non trouvé)",
  "description": "Description courte de la recette",
  "rendement": "Taille, nombre d'unités ou de personnes (ex: 1 gâteau de 20cm, 8 personnes)",
  "ustensiles": ["ustensile 1", "ustensile 2"],
  "etapes": [
    {
      "nom_etape": "Nom du regroupement (ex: Biscuit cuillère)",
      "temps_preparation_minutes": 15,
      "temps_attente_minutes": 0,
      "temps_cuisson_minutes": 12,
      "temperature_cuisson_celsius": 180,
      "anticipation_jours": 2,
      "ingredients": [
        {
          "nom": "Farine",
          "quantite": 250,
          "unite": "g"
        }
      ],
      "instructions": [
        "Première action de cette étape.",
        "Deuxième action."
      ],
      "conseils_etape": "Conseil spécifique à cette étape (null si aucun)"
    }
  ],
  "astuces_recette": ["Astuce globale 1", "Astuce globale 2"],
  "conseils_conservation": "Instructions pour la dégustation et conservation"
}`;

// Unités cibles de la base. L'IA n'étant plus contrainte de convertir, la
// normalisation est faite ici, de façon déterministe (cf. `normaliseUnite`).
const UNITES = new Set(['g', 'ml', 'piece']);

// Variantes d'unités rencontrées dans les recettes → unité cible et facteur
// appliqué à la quantité. Table explicite plutôt que consignes de conversion
// confiées à l'IA : le résultat est reproductible et ne coûte aucun token.
const CONVERSIONS: Record<string, { unite: string; facteur: number }> = {
  g: { unite: 'g', facteur: 1 },
  gr: { unite: 'g', facteur: 1 },
  gramme: { unite: 'g', facteur: 1 },
  grammes: { unite: 'g', facteur: 1 },
  kg: { unite: 'g', facteur: 1000 },
  kilo: { unite: 'g', facteur: 1000 },
  kilos: { unite: 'g', facteur: 1000 },
  ml: { unite: 'ml', facteur: 1 },
  millilitre: { unite: 'ml', facteur: 1 },
  millilitres: { unite: 'ml', facteur: 1 },
  cl: { unite: 'ml', facteur: 10 },
  dl: { unite: 'ml', facteur: 100 },
  l: { unite: 'ml', facteur: 1000 },
  litre: { unite: 'ml', facteur: 1000 },
  litres: { unite: 'ml', facteur: 1000 },
  'c. à s.': { unite: 'ml', facteur: 15 },
  cas: { unite: 'ml', facteur: 15 },
  cs: { unite: 'ml', facteur: 15 },
  'cuillère à soupe': { unite: 'ml', facteur: 15 },
  'cuillères à soupe': { unite: 'ml', facteur: 15 },
  'c. à c.': { unite: 'ml', facteur: 5 },
  cac: { unite: 'ml', facteur: 5 },
  cc: { unite: 'ml', facteur: 5 },
  'cuillère à café': { unite: 'ml', facteur: 5 },
  'cuillères à café': { unite: 'ml', facteur: 5 },
  feuille: { unite: 'g', facteur: 2 }, // gélatine : 1 feuille ≈ 2 g
  feuilles: { unite: 'g', facteur: 2 },
  piece: { unite: 'piece', facteur: 1 },
  pièce: { unite: 'piece', facteur: 1 },
  pièces: { unite: 'piece', facteur: 1 },
  unite: { unite: 'piece', facteur: 1 },
  unité: { unite: 'piece', facteur: 1 },
  unités: { unite: 'piece', facteur: 1 },
  u: { unite: 'piece', facteur: 1 },
};

// Unité + quantité ramenées aux unités de la base. Renvoie `reconnue: false`
// quand l'unité est inconnue : la valeur brute est conservée et signalée en
// alerte, plutôt que silencieusement écrasée.
export function normaliseUnite(
  quantite: number | null | undefined,
  unite: string | null | undefined,
): { quantite: number | null; unite: string | null; reconnue: boolean } {
  const q = typeof quantite === 'number' && isFinite(quantite) ? quantite : null;
  const brut = String(unite ?? '').trim().toLowerCase();
  if (!brut) return { quantite: q, unite: null, reconnue: true };
  const conv = CONVERSIONS[brut];
  if (!conv) return { quantite: q, unite: brut, reconnue: false };
  return {
    // Arrondi à 2 décimales : évite les 33.333333 issus des conversions.
    quantite: q == null ? null : Math.round(q * conv.facteur * 100) / 100,
    unite: conv.unite,
    reconnue: true,
  };
}

// Comportement d'un ingrédient lors d'un changement de quantités. Déduit du
// libellé plutôt que demandé à l'IA : règle stable, sans coût de génération.
export function deduireScaling(nom: string): 'lineaire' | 'lineaire_arrondi' | 'fixe' {
  // « œ » n'étant pas un caractère de mot, `\b` ne s'amorce pas devant lui :
  // on rétablit le digramme avant de tester (« œufs » → « oeufs »).
  const n = nom.toLowerCase().replace(/œ/g, 'oe');
  if (/\b(oeufs?|jaunes?|blancs?|gélatine|gelatine)\b/.test(n)) return 'lineaire_arrondi';
  if (/\b(pincée|pincee|sel|vanille|arôme|arome|extrait|zeste|parfum|colorant)\b/.test(n)) return 'fixe';
  return 'lineaire';
}

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

// Nettoyage de la sortie IA, sur ses propres clés :
//  - ligature « œuf » (« oeuf » → « œuf ») sur tous les textes ;
//  - majuscule initiale sur le nom des ingrédients et des ustensiles
//    (« jaune d'oeuf » → « Jaune d'œuf ») ;
//  - libellés vides retirés des tableaux (instructions, astuces, ustensiles).
export function cleanPivotRecette(r: RecetteIA): void {
  if (!r || typeof r !== 'object') return;

  if (typeof r.titre === 'string') r.titre = ligatureOeuf(r.titre).trim();
  if (typeof r.description === 'string') r.description = ligatureOeuf(r.description).trim() || null;
  if (typeof r.rendement === 'string') r.rendement = ligatureOeuf(r.rendement).trim() || null;
  if (typeof r.conseils_conservation === 'string') {
    r.conseils_conservation = ligatureOeuf(r.conseils_conservation).trim() || null;
  }

  const textes = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).map((x) => ligatureOeuf(String(x ?? '')).trim()).filter(Boolean);

  r.astuces_recette = textes(r.astuces_recette);
  r.ustensiles = textes(r.ustensiles).map(capitalize);

  (r.etapes || []).forEach((e) => {
    if (typeof e.nom_etape === 'string') e.nom_etape = ligatureOeuf(e.nom_etape).trim();
    if (typeof e.conseils_etape === 'string') e.conseils_etape = ligatureOeuf(e.conseils_etape).trim() || null;
    e.instructions = textes(e.instructions);
    (e.ingredients || []).forEach((ing) => {
      if (typeof ing.nom === 'string') ing.nom = capitalize(ligatureOeuf(ing.nom).trim());
    });
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

// Validation de la sortie IA, sur ses propres clés. `erreurs` = bloquant
// (l'import est refusé) ; `alertes` = signalé à la relecture sans bloquer.
// L'unité inconnue est une alerte et non une erreur : `normaliseUnite` couvre
// les cas courants, et une unité exotique se corrige en relecture — la refuser
// ferait perdre toute l'extraction pour un seul ingrédient.
export function validatePivot(r: RecetteIA): { erreurs: string[]; alertes: string[] } {
  const erreurs: string[] = [];
  const alertes: string[] = [];
  if (!r || typeof r !== 'object') return { erreurs: ['Objet JSON manquant.'], alertes };

  if (!r.titre || !String(r.titre).trim()) erreurs.push('Champ obligatoire manquant : titre.');
  if (!r.rendement || !String(r.rendement).trim()) {
    alertes.push('Rendement non détecté : à renseigner à la relecture.');
  }

  const etapes: EtapeIA[] = Array.isArray(r.etapes) ? r.etapes : [];
  if (!etapes.length) erreurs.push('Au moins une étape est requise.');

  let cuissonOuRepos = false;
  etapes.forEach((e, i) => {
    const nom = e.nom_etape || `étape ${i + 1}`;
    const aIng = Array.isArray(e.ingredients) && e.ingredients.length > 0;
    const aInstr = Array.isArray(e.instructions) && e.instructions.length > 0;
    if (!aIng && !aInstr) erreurs.push(`« ${nom} » : ni ingrédient ni instruction.`);
    else if (!aIng) alertes.push(`« ${nom} » : aucun ingrédient (montage ou assemblage ?) — à vérifier.`);
    else if (!aInstr) alertes.push(`« ${nom} » : aucune instruction — à vérifier.`);

    (e.ingredients || []).forEach((ing) => {
      const { quantite, unite, reconnue } = normaliseUnite(ing.quantite, ing.unite);
      if (!reconnue) {
        alertes.push(`« ${nom} » / ${ing.nom} : unité « ${unite} » non reconnue — à corriger.`);
      }
      if (ing.quantite != null && !(Number(ing.quantite) > 0)) {
        erreurs.push(`« ${nom} » / ${ing.nom} : quantité invalide (${ing.quantite}).`);
      }
      if (quantite != null && quantite > 2000 && unite && UNITES.has(unite) && unite !== 'piece') {
        alertes.push(`Quantité inhabituelle : ${ing.nom} — ${quantite} ${unite}.`);
      }
    });

    if (Number(e.temperature_cuisson_celsius) > 250) {
      alertes.push(`Température élevée : ${e.temperature_cuisson_celsius} °C (« ${nom} »).`);
    }
    if (Number(e.temps_cuisson_minutes) > 0 || Number(e.temps_attente_minutes) > 0) cuissonOuRepos = true;
  });

  if (!cuissonOuRepos) alertes.push('Aucune cuisson ni repos détecté : vérifiez la recette.');
  return { erreurs, alertes };
}

// ── Adaptateur vers le pivot interne ─────────────────────────
// L'écran de relecture et l'écriture en base attendent la structure historique
// (sous_preparations, rendement objet, scaling…). L'IA ne la produit plus :
// cette fonction fait la conversion, de façon purement déterministe.
//
// Champs que l'IA ne renvoie plus et qui restent à saisir à la relecture :
// catégorie, tags, difficulté, et le moule structuré (forme + dimensions) dont
// dépend l'ajustement par volume. Le rendement textuel est reporté en mode
// « description libre » pour ne rien perdre de ce qui a été extrait.
export function toPivotInterne(r: RecetteIA): Pivot {
  const etapes: EtapeIA[] = Array.isArray(r.etapes) ? r.etapes : [];
  const somme = (f: (e: EtapeIA) => unknown): number | null => {
    const t = etapes.reduce((n, e) => n + (Number(f(e)) || 0), 0);
    return t > 0 ? t : null;
  };

  return {
    schema_version: '1.0',
    titre: r.titre || '',
    description: r.description || null,
    // Non extraits par le nouveau schéma : laissés vides pour la relecture.
    categorie: null,
    tags: [],
    difficulte: null,
    temps: {
      preparation_min: somme((e) => e.temps_preparation_minutes),
      cuisson_min: somme((e) => e.temps_cuisson_minutes),
      repos_min: somme((e) => e.temps_attente_minutes),
      congelation_min: null,
    },
    // Rendement textuel → mode « description libre » de l'éditeur, pré-rempli.
    rendement: {
      mode: 'dimensions',
      libelle_corrige: r.rendement || '',
      type: null,
      portions: null,
      pieces: null,
      moule: null,
    },
    sous_preparations: etapes.map((e, i) => ({
      ordre: i + 1,
      nom: e.nom_etape || `Préparation ${i + 1}`,
      // Entier ≥ 0 : une anticipation négative ou absente vaut « jour J ».
      day_offset: Math.max(0, Math.trunc(Number(e.anticipation_jours)) || 0),
      temps: {
        preparation_min: Number(e.temps_preparation_minutes) || null,
        attente_min: Number(e.temps_attente_minutes) || null,
        cuisson_min: Number(e.temps_cuisson_minutes) || null,
      },
      temperature_c: Number(e.temperature_cuisson_celsius) || null,
      ingredients: (e.ingredients || []).map((ing) => {
        const { quantite, unite } = normaliseUnite(ing.quantite, ing.unite);
        return {
          nom: ing.nom || '',
          quantite,
          unite,
          // `texte_original` est reconstitué par l'éditeur depuis quantité +
          // unité + nom quand il est absent : inutile de le faire générer.
          texte_original: null,
          note: null,
          scaling: deduireScaling(ing.nom || ''),
        };
      }),
      etapes: (e.instructions || []).map((texte, k) => ({
        ordre: k + 1,
        texte,
        // Les temps sont portés par le regroupement, pas par chaque
        // instruction : rien à placer ici sans le deviner.
        duree_min: null,
        temperature_c: null,
      })),
      conseils: e.conseils_etape || null,
      materiel: [],
    })),
    // Ustensiles globaux : le schéma ne les rattache plus à une étape.
    materiel: Array.isArray(r.ustensiles) ? r.ustensiles : [],
    notes: (r.astuces_recette || []).join('\n') || null,
    conseils_degustation: r.conseils_conservation || null,
    source: {
      auteur_origine: r.auteur_origine || null,
      url_origine: null,
      video_url: r.video_url || null,
    },
    photos: [],
  };
}

// Budget cumulé des appels IA d'un import, en deçà du `maxDuration = 60` de la
// route : la marge restante couvre les requêtes Supabase et l'envoi de la
// réponse.
const BUDGET_MS = 50_000;

// ── Normalisation IA (§4.1) ──────────────────────────────────
// Au plus UNE relance au total (JSON invalide OU extraction incomplète, jamais
// les deux) : la route serverless a un temps limite (maxDuration), et trois
// appels séquentiels de 8000 tokens chacun peuvent le dépasser sur une recette
// complexe. Priorité à la validité du JSON, prérequis à toute exploitation.
export async function normalizeRecette(
  apiKey: string,
  contenu: string,
): Promise<{ pivot: Pivot; usage: ClaudeUsage; erreurs: string[]; alertes: string[] }> {
  // Budget de temps partagé par les (au plus deux) appels : la relance ne doit
  // pas pousser la fonction serverless au-delà de son `maxDuration`, sinon
  // l'hébergeur la coupe avant qu'on ait pu renvoyer une erreur exploitable.
  const debut = Date.now();
  const restant = () => Math.max(5_000, BUDGET_MS - (Date.now() - debut));

  const base = `${PROMPT}\n\nContenu à analyser :\n${contenu}`;
  const first = await callClaude(apiKey, base, 8000, restant());

  let recette: RecetteIA;
  let usage = first.usage;
  let relanceUtilisee = false;
  try {
    recette = parseStrictJson(first.text) as RecetteIA;
  } catch (err) {
    relanceUtilisee = true;
    const retry = await callClaude(
      apiKey,
      `${base}\n\nTa réponse précédente n'était pas un JSON valide (erreur : ${(err as Error).message}). Renvoie UNIQUEMENT l'objet JSON corrigé.`,
      8000,
      restant(),
    );
    usage = addUsage(usage, retry.usage);
    try {
      recette = parseStrictJson(retry.text) as RecetteIA;
    } catch (err2) {
      // Les deux appels ont été facturés : on rattache la consommation à
      // l'erreur pour que l'appelant puisse la comptabiliser malgré l'échec.
      throw Object.assign(err2 as Error, { usage });
    }
  }

  cleanPivotRecette(recette);
  let { erreurs, alertes } = validatePivot(recette);
  if (erreurs.length && !relanceUtilisee) {
    const retry = await callClaude(
      apiKey,
      `${PROMPT}\n\nContenu à analyser :\n${contenu}\n\nIMPORTANT : une première extraction était incomplète — ${erreurs.join(' ')} Relis attentivement le contenu et renvoie le JSON COMPLET : chaque étape doit contenir TOUS ses ingrédients et TOUTES ses instructions.`,
      8000,
      restant(),
    );
    usage = addUsage(usage, retry.usage);
    try {
      const recette2 = parseStrictJson(retry.text) as RecetteIA;
      cleanPivotRecette(recette2);
      const v2 = validatePivot(recette2);
      if (!v2.erreurs.length) {
        recette = recette2;
        erreurs = v2.erreurs;
        alertes = v2.alertes;
      }
      // Relance encore incomplète : on garde la première extraction et ses
      // erreurs plutôt que de tenter une 3e relance.
    } catch {
      /* JSON invalide sur la relance : on garde la première extraction */
    }
  }

  // Conversion vers la structure attendue par la relecture et la base.
  return { pivot: toPivotInterne(recette), usage, erreurs, alertes };
}
