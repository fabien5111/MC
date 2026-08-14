// Recherche externe — étape 3 de la spec « Contrôle IA à la validation des
// recettes » (§6.4). Extraction de phrases signatures (pures) + construction
// du prompt pour l'appel avec l'outil serveur `web_search` (recherche ciblée
// sur 2-3 phrases caractéristiques, jamais sur les ingrédients ni le titre
// seul — « tarte au citron meringuée » retournerait 100 000 résultats tous
// « similaires »).
//
// Couche B (embeddings) hors périmètre de ce lot : aucun fournisseur retenu
// (décision produit — pas d'API d'embeddings chez Anthropic). La comparaison
// contre les pages trouvées s'appuie donc sur le jugement du modèle plutôt
// que sur un calcul déterministe comme la couche A interne — restituée comme
// une estimation dans l'admin, pas comme un pourcentage mesuré.
import type { RecipeFull } from '@/lib/recipes';

const MIN_WORDS = 12;

// Tournures purement techniques et universelles à exclure (§6.4 donne
// l'exemple « mélanger jusqu'à obtention d'une pâte homogène ») — liste
// courte, à enrichir avec l'usage comme la stop-list de lib/recipe-analysis.ts.
const GENERIC_PATTERNS = [
  /mélanger jusqu'à obtention d'une? (pâte|préparation|masse) homogène/i,
  /(mélangez|mélanger) (bien|jusqu'à ce que|le tout)/i,
  /préchauffer le four/i,
  /laisser (refroidir|reposer)/i,
  /(verser|versez) (la préparation|le mélange)/i,
];

function isGeneric(sentence: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(sentence));
}

// Sélectionne les phrases du texte ORIGINAL (pas le texte normalisé de
// l'étape 0 : la recherche web a besoin d'une formulation naturelle,
// cherchable telle quelle) — les plus longues parmi celles ≥ 12 mots et non
// génériques (§6.4). Tableau vide si aucune ne satisfait ces critères
// (recette télégraphique, cas de test #9) : la recherche externe n'est alors
// pas lancée.
//
// DEUX phrases, pas trois : chaque phrase coûte un aller-retour complet
// (recherche + lecture des pages trouvées + jugement), et trois ne tenaient
// pas dans le budget de la route — la vérification externe était interrompue
// avant d'avoir rien produit, donc trois phrases valaient zéro résultat. Ce
// nombre doit rester aligné sur le `max_uses` de l'outil web_search
// (lib/ai/claude.ts) : en demander plus que d'appels autorisés fait perdre
// du temps au modèle sans jamais aboutir.
export function extractSignaturePhrases(recipe: RecipeFull, max = 2): string[] {
  const parts = [
    recipe.description,
    ...(recipe.recipe_steps ?? []).flatMap((s) => [s.description, s.tips, ...(s.sous_etapes ?? [])]),
  ];
  const sentences = parts
    .filter((p): p is string => !!p)
    .join(' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= MIN_WORDS)
    .filter((s) => !isGeneric(s));

  const seen = new Set<string>();
  const unique = sentences.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => b.length - a.length).slice(0, max);
}

export function buildExternalSearchSystemPrompt(): string {
  return `Tu vérifies si des phrases extraites d'une recette de pâtisserie soumise à publication apparaissent déjà, telles quelles ou reformulées, sur d'autres sites internet.

Fais UNE seule recherche web par phrase fournie (recherche exacte, entre guillemets), et pas davantage : ton budget de recherches est strictement limité au nombre de phrases. Ne reformule pas une recherche qui n'a rien donné — passe à la phrase suivante, ou conclus. Ignore les résultats provenant du site lui-même. Pour chaque correspondance sérieuse trouvée (pas une simple recette similaire du même plat — une formulation reconnaissable), indique :
- l'URL de la page,
- le titre de la page,
- un niveau de confiance : "exacte" (le texte apparaît mot pour mot ou presque), "proche" (reformulation reconnaissable), "faible" (ressemblance ténue, à vérifier),
- un extrait de la page qui justifie ce niveau.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte ni balises autour :
{"correspondances": [{"phrase": "<la phrase recherchée>", "url": "...", "titre": "...", "confiance": "exacte", "extrait": "..."}]}

Tableau vide si aucune correspondance sérieuse. Ne remonte jamais une simple recette du même type de dessert : seule une formulation reconnaissable compte.`;
}

export function buildExternalSearchUserContent(phrases: string[]): string {
  return `Phrases à vérifier :\n${phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`;
}

export type ExternalConfidence = 'exacte' | 'proche' | 'faible';

export type ExternalMatch = {
  phrase: string;
  url: string;
  titre: string;
  confiance: ExternalConfidence;
  extrait: string;
};

const CONFIDENCE_SCORE: Record<ExternalConfidence, number> = { exacte: 90, proche: 60, faible: 30 };

export function confidenceScore(c: ExternalConfidence): number {
  return CONFIDENCE_SCORE[c];
}

function stripCodeFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : t;
}

// Parsing tolérant : une correspondance mal formée est ignorée plutôt que de
// faire échouer tout le lot (best-effort, comme le reste de l'étape 3).
export function parseExternalMatches(rawText: string): ExternalMatch[] {
  let obj: unknown;
  try {
    obj = JSON.parse(stripCodeFences(rawText));
  } catch {
    return [];
  }
  const raw = (obj as { correspondances?: unknown[] })?.correspondances;
  if (!Array.isArray(raw)) return [];
  const out: ExternalMatch[] = [];
  for (const item of raw) {
    const m = item as Partial<ExternalMatch>;
    if (typeof m.url !== 'string' || typeof m.phrase !== 'string') continue;
    const confiance: ExternalConfidence =
      m.confiance === 'exacte' || m.confiance === 'proche' || m.confiance === 'faible' ? m.confiance : 'faible';
    out.push({
      phrase: m.phrase.slice(0, 300),
      url: m.url,
      titre: typeof m.titre === 'string' ? m.titre.slice(0, 200) : m.url,
      confiance,
      extrait: typeof m.extrait === 'string' ? m.extrait.slice(0, 300) : '',
    });
    if (out.length >= 5) break;
  }
  return out;
}
