// Coût réel d'un appel IA, calculé depuis la consommation renvoyée par l'API
// (jamais estimé). Logique pure : utilisable côté serveur comme côté client.
//
// ⚠️ Les tarifs sont figés ici, dans l'application. Si Anthropic change ses prix
// ou si `IMPORT_MODEL` pointe vers un modèle absent de la table, `computeCost`
// renvoie `null` (coût inconnu) plutôt qu'un chiffre faux.
//
// ⚠️ La table ci-dessous n'est PLUS la référence du suivi des coûts : depuis le
// journal `ai_usage`, c'est la table SQL `ai_pricing` (historisée, un tarif par
// date d'effet) qui fait foi — un changement de prix ne doit pas réécrire le
// passé, ce qu'une table figée dans le code fait forcément. `recipe_scale_costs`
// et les colonnes de coût de `recipe_analysis` ont été retirées (bascule
// complète vers `ai_usage`, cf. lib/admin.ts `getAiUsageDetail` /
// `getCoutsParRef`). Seule `imports.cost_usd` (§ ci-dessous) continue d'utiliser
// `computeCost` : elle alimente la colonne coût de « Mes imports »
// (ImporterList), affichage par import que `ai_usage` ne peut pas reconstituer
// aujourd'hui (le coût de la transcription photo, elle, n'est pas rattachée à
// l'import qui n'existe pas encore au moment de l'appel).
import type { ClaudeUsage } from '@/lib/ai/claude';

// Tarifs en dollars par million de tokens.
type Tarif = {
  input: number;
  output: number;
  // Tarif d'introduction, applicable jusqu'à `jusquAu` inclus (AAAA-MM-JJ).
  intro?: { input: number; output: number; jusquAu: string };
};

const TARIFS: Record<string, Tarif> = {
  // 2 $ / 10 $ SANS échéance : annoncé au lancement comme tarif
  // d'introduction jusqu'au 31/08/2026, il est devenu le tarif standard
  // et la hausse à 3 $ / 15 $ au 01/09/2026 N'AURA PAS LIEU (note
  // officielle sur la page de tarification, relevée le 28/08/2026).
  // Laisser le `intro` daté aurait majoré de 50 % le coût de toute
  // transcription photo à partir du 1er septembre.
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
};

// Multiplicateurs de cache appliqués au tarif d'entrée (lecture ~0,1× ; écriture
// ~1,25× pour une durée de vie de 5 minutes).
const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;

// Recherche web (outil serveur `web_search`, §6.4) : facturée séparément des
// tokens, à l'unité — pas de champ `usage` dédié côté API. Tarif Anthropic
// (10 $ / 1000 recherches), utilisé par le contrôle IA à la validation des
// recettes pour chiffrer le coût de l'étape 3.
export const WEB_SEARCH_USD_PER_SEARCH = 0.01;

// Taux de conversion dollar → euro, configurable car aucun taux n'est fiable
// durablement. Sert uniquement à afficher une conversion indicative.
const TAUX_EUR = Number(process.env.IMPORT_USD_EUR) || 0.92;

export type CostBreakdown = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usd: number;
  eur: number;
  /** Tarif d'introduction appliqué (le prix remontera à sa fin). */
  tarifIntro: boolean;
};

function tarifApplicable(t: Tarif, le: Date): { input: number; output: number; intro: boolean } {
  if (t.intro && le.toISOString().slice(0, 10) <= t.intro.jusquAu) {
    return { input: t.intro.input, output: t.intro.output, intro: true };
  }
  return { input: t.input, output: t.output, intro: false };
}

// Coût d'une consommation pour un modèle donné. `null` si le modèle est inconnu
// de la table de tarifs — l'appel doit alors être affiché comme « coût inconnu ».
export function computeCost(
  usage: ClaudeUsage,
  model: string,
  le: Date = new Date(),
): CostBreakdown | null {
  const tarif = TARIFS[model];
  if (!tarif) return null;
  const { input, output, intro } = tarifApplicable(tarif, le);

  const usd =
    (usage.inputTokens * input +
      usage.outputTokens * output +
      usage.cacheReadTokens * input * CACHE_READ +
      usage.cacheWriteTokens * input * CACHE_WRITE) /
    1_000_000;

  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    // 6 décimales : un import coûte quelques centimes, l'arrondi au centime
    // écraserait l'information.
    usd: Math.round(usd * 1e6) / 1e6,
    eur: Math.round(usd * TAUX_EUR * 1e6) / 1e6,
    tarifIntro: intro,
  };
}

// Les crédits Anthropic sont libellés en dollars (1 crédit = 1 $ US) : le coût
// en crédits est donc identique au coût en dollars. Fonction explicite pour que
// l'affichage n'ait pas à réénoncer cette équivalence.
export function usdToCredits(usd: number): number {
  return usd;
}

export function formatUsd(usd: number): string {
  return usd < 0.01 && usd > 0
    ? `${(usd * 100).toFixed(2)} ¢`
    : usd.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });
}

export function formatEur(eur: number): string {
  return eur < 0.01 && eur > 0
    ? `${(eur * 100).toFixed(2)} c€`
    : eur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

export const TAUX_EUR_AFFICHE = TAUX_EUR;
