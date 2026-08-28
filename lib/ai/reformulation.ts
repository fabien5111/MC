// Couche B, approximation sans fournisseur d'embeddings (arbitrage produit) :
// détecte une recette recopiée puis reformulée — que la couche A (shingles
// littéraux) manque par construction — via un jugement Claude ciblé sur les
// candidats déjà repérés comme structurellement proches (couche C, mêmes
// ingrédients), plutôt qu'une recherche vectorielle exhaustive sur tout le
// corpus. Coûte un appel IA de plus, mais seulement sur quelques candidats
// déjà filtrés, jamais sur le corpus entier.
export function buildReformulationSystemPrompt(): string {
  return `Tu compares deux recettes de pâtisserie qui partagent des ingrédients proches, pour déterminer si l'une est une reformulation de l'autre (même recette, texte réécrit) plutôt que deux recettes indépendantes du même type de dessert qui se ressemblent normalement.

"reformulation": true seulement si le déroulé des étapes, leur ordre et leur logique interne se correspondent de façon reconnaissable, au-delà de la simple parenté du plat. Deux tartes au citron indépendantes qui partagent les ingrédients et une structure générique (pâte, crème, cuisson) ne sont PAS une reformulation : réponds false. Le texte est normalisé (minuscules, quantités retirées) : ignore cette normalisation, juge sur le déroulé et la formulation qui reste.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte ni balises autour :
{"reformulation": true, "confiance": "forte", "explication": "une phrase factuelle en français", "extrait_a": "passage de la recette A illustrant le rapprochement", "extrait_b": "passage correspondant de la recette B"}

"confiance" : "forte", "moyenne" ou "faible". Si "reformulation" est false, omets "extrait_a"/"extrait_b".`;
}

export function buildReformulationUserContent(textA: string, textB: string): string {
  return `Recette A :\n${textA}\n\nRecette B :\n${textB}`;
}

export type ReformulationConfidence = 'forte' | 'moyenne' | 'faible';

export type ReformulationResult = {
  reformulation: boolean;
  confiance: ReformulationConfidence;
  explication: string;
  extraitA: string;
  extraitB: string;
};

const CONFIDENCE_SCORE: Record<ReformulationConfidence, number> = { forte: 80, moyenne: 55, faible: 35 };

export function reformulationScore(confiance: ReformulationConfidence): number {
  return CONFIDENCE_SCORE[confiance];
}

function stripCodeFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : t;
}

// Parsing tolérant, best-effort comme le reste de l'étape 2 : une réponse
// mal formée est traitée comme « pas de reformulation détectée » plutôt que
// de faire échouer toute l'analyse.
export function parseReformulationResult(rawText: string): ReformulationResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(stripCodeFences(rawText));
  } catch {
    return null;
  }
  const r = obj as Partial<{
    reformulation: unknown;
    confiance: unknown;
    explication: unknown;
    extrait_a: unknown;
    extrait_b: unknown;
  }>;
  if (typeof r.reformulation !== 'boolean') return null;
  const confiance: ReformulationConfidence =
    r.confiance === 'forte' || r.confiance === 'moyenne' || r.confiance === 'faible' ? r.confiance : 'faible';
  return {
    reformulation: r.reformulation,
    confiance,
    explication: typeof r.explication === 'string' ? r.explication.slice(0, 300) : '',
    extraitA: typeof r.extrait_a === 'string' ? r.extrait_a.slice(0, 300) : '',
    extraitB: typeof r.extrait_b === 'string' ? r.extrait_b.slice(0, 300) : '',
  };
}
