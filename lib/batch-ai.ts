// Détail d'un ajustement par IA, conservé sur la fournée (`batches.adjust_ai`,
// jsonb) pour être relu après le lancement : la demande, ce que l'IA a
// proposé et pourquoi. Affichage seul — le calcul des quantités ne lit que
// `batches.factor`. Logique pure, utilisable côté serveur comme côté client.
//
// La colonne est ajoutée à la main (DDL par `psql`) et absente de
// `lib/database.types.ts` jusqu'à la régénération : elle est lue par le
// `select('*')` de `BATCH_FULL_SELECT`, et écrite à part de la création de la
// fournée, en ignorant l'échec (colonne absente → fournée créée sans détail).

export type AjustementIA = {
  demande: string;
  // Coefficient PROPOSÉ par l'IA — le coefficient appliqué (`factor`) peut
  // différer si le membre l'a retouché avant de lancer la fournée.
  coefficient: number;
  explication: string;
  propositions: string[];
  complement: string | null;
};

function texte(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// Relit `batches.adjust_ai` tel qu'il vient de la base : `null` dès que la
// valeur n'a pas la forme attendue (colonne absente, ligne antérieure, JSON
// abîmé), jamais d'exception à l'affichage.
export function lireAjustementIA(v: unknown): AjustementIA | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const coefficient = typeof o.coefficient === 'number' && isFinite(o.coefficient) && o.coefficient > 0 ? o.coefficient : null;
  if (coefficient == null) return null;
  const propositions = Array.isArray(o.propositions)
    ? o.propositions.map((p) => texte(p, 200)).filter((p): p is string => p !== null).slice(0, 3)
    : [];
  return {
    demande: texte(o.demande, 1000) ?? '',
    coefficient,
    explication: texte(o.explication, 400) ?? '',
    propositions,
    complement: texte(o.complement, 200),
  };
}

// Le coefficient appliqué diffère-t-il de celui que l'IA a proposé ? (même
// arrondi à 2 décimales que la route, pour ne pas signaler un faux écart).
export function coefficientRetouche(ai: AjustementIA, applique: number): boolean {
  return Math.round(applique * 100) !== Math.round(ai.coefficient * 100);
}

// Libellé d'ajustement (`batches.adjust_label`) tel qu'affiché : les fournées
// lancées par ingrédient avant le 22/10/2026 portent « Base <ingrédient> : … »,
// devenu « Ajustement <ingrédient> : … ». Traduit à la lecture, sans migration.
export function libelleAjustement(label: string | null | undefined): string | null {
  if (!label) return null;
  return label.replace(/^Base /, 'Ajustement ');
}

// Ajustement par ingrédient relu depuis son libellé (« Ajustement Levain :
// 350 g ») pour pré-remplir la modification d'une fournée. `null` pour tout
// autre libellé.
export function lireAjustementIngredient(label: string | null | undefined): { nom: string; quantite: string } | null {
  const m = /^(?:Base|Ajustement) (.+) : ([\d.,]+)(?:\s.*)?$/.exec(libelleAjustement(label) ?? '');
  return m ? { nom: m[1].trim(), quantite: m[2] } : null;
}
