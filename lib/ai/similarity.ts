// Similarité interne — étape 2 de la spec « Contrôle IA à la validation des
// recettes » (§6.3). Couche A (shingles + plus longue séquence commune,
// signal fort) et un proxy pour la couche C (Jaccard sur les ingrédients
// canoniques, informatif). Fonctions pures ; l'appelant (route API) fournit
// le corpus des recettes déjà publiées.
//
// Simplification assumée pour ce lot : pas d'index persistant (MinHash /
// index inversé décrit au §6.3). Les shingles sont recalculés à la volée à
// chaque analyse, comparés au corpus des recettes publiées lu en base — un
// balayage complet reste largement praticable à l'échelle actuelle du site
// (des dizaines à quelques centaines de recettes). À revoir si le corpus
// grossit au point de rendre le balayage coûteux (cf. §6.3 « Maintenance de
// l'index », non implémenté ici).
import type { StructuralIngredient } from '@/lib/recipe-analysis';

// --- Couche A : shingles + Jaccard + plus longue séquence commune ---------

// Découpe un texte normalisé en shingles glissants de `size` mots (défaut 8,
// §6.3). Un texte plus court que `size` produit un unique shingle (le texte
// entier) plutôt qu'un ensemble vide, pour ne pas priver les recettes très
// courtes de toute comparaison.
export function buildShingles(text: string, size = 8): Set<string> {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return new Set();
  if (words.length < size) return new Set([words.join(' ')]);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

export function jaccardIndex(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

// Plus longue suite de mots consécutifs commune à deux textes (programmation
// dynamique en une ligne de tableau, O(longueurs) en mémoire) : la preuve la
// plus convaincante pour l'administrateur (§6.3 : « 34 mots consécutifs
// identiques »). Les textes de recette restent courts (quelques centaines de
// mots) : le coût O(n·m) en temps est négligeable pour une paire, mais reste
// borné à un petit nombre de paires par l'appelant (cf. route).
export function longestCommonWordRun(textA: string, textB: string): { length: number; words: string[] } {
  const wordsA = textA.split(/\s+/).filter(Boolean);
  const wordsB = textB.split(/\s+/).filter(Boolean);
  if (!wordsA.length || !wordsB.length) return { length: 0, words: [] };

  let prev = new Array<number>(wordsB.length + 1).fill(0);
  let best = 0;
  let bestEndA = 0;
  for (let i = 1; i <= wordsA.length; i++) {
    const curr = new Array<number>(wordsB.length + 1).fill(0);
    for (let j = 1; j <= wordsB.length; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) {
          best = curr[j];
          bestEndA = i;
        }
      }
    }
    prev = curr;
  }
  return { length: best, words: wordsA.slice(bestEndA - best, bestEndA) };
}

// --- Couche C (proxy) : Jaccard sur les ingrédients canoniques -------------

// Version simplifiée du §6.3 couche C : Jaccard sur l'ensemble des
// ingrédients canoniques (lib/recipe-analysis.ts), sans pondération par les
// proportions ni comparaison de la séquence des verbes — un premier signal
// informatif, affinable ultérieurement sans changer l'appelant.
export function structuralJaccard(a: StructuralIngredient[], b: StructuralIngredient[]): number {
  return jaccardIndex(new Set(a.map((i) => i.canonicalKey)), new Set(b.map((i) => i.canonicalKey)));
}

// --- Drapeau (§8) -----------------------------------------------------------

export type Flag = 'vert' | 'orange' | 'rouge';

const FLAG_RANK: Record<Flag, number> = { vert: 0, orange: 1, rouge: 2 };

// La modération ne peut que durcir le drapeau (§8) : jamais l'adoucir. On
// retient donc systématiquement le plus sévère des deux signaux.
export function combineFlags(...flags: Flag[]): Flag {
  return flags.reduce((worst, f) => (FLAG_RANK[f] > FLAG_RANK[worst] ? f : worst), 'vert' as Flag);
}

// Valeurs de départ proposées par la spec (§8), à rendre configurables une
// fois observées les premières semaines d'usage réel — en dur pour ce lot.
export const EDITORIAL_ROUGE_PCT = 70;
export const EDITORIAL_ORANGE_PCT = 40;
export const SEQUENCE_ROUGE_WORDS = 25;
export const SEQUENCE_ORANGE_WORDS = 20;

// §8 : rouge si similarité rédactionnelle ≥ 70 % OU séquence commune ≥ 25
// mots ; orange si 40-69 % OU séquence ≥ 20 mots ; vert sinon. Le score
// rédactionnel restitué (`editorialScorePercent`) est l'indice de Jaccard sur
// les shingles, en pourcentage — seul signal disponible tant que la couche B
// (embeddings, hors périmètre de ce lot) n'existe pas.
export function similarityFlag(editorialScorePercent: number, longestSequenceWords: number): Flag {
  if (editorialScorePercent >= EDITORIAL_ROUGE_PCT || longestSequenceWords >= SEQUENCE_ROUGE_WORDS) return 'rouge';
  if (editorialScorePercent >= EDITORIAL_ORANGE_PCT || longestSequenceWords >= SEQUENCE_ORANGE_WORDS) return 'orange';
  return 'vert';
}
