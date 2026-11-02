// Lecture de « La dernière fois » (JEP-381) : fournée de référence et choix
// du membre (`remarques_gardees`). Logique pure : `lib/batch-lecons.ts`.
//
// Sous la session du membre : la RLS (`owns_plan()`, policy propriétaire de
// `remarques_gardees`) ne laisse lire que ses propres données.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import {
  ecartQuantite,
  libelleEcartProduit,
  lireLecon,
  remarquesDeFournee,
  type DecisionRemarque,
  type FourneeReference,
  type RefIngredient,
  type RefStep,
  type Remarque,
} from '@/lib/batch-lecons';

// `*` sur `batches` (et non une liste de colonnes) : `lecon` est posée à la
// main (DDL par psql) — la nommer ferait échouer la lecture avant la
// migration. Même doctrine que `adjust_ai`. Idem pour `batch_steps` :
// `ecart_produit_g` (quantité obtenue) est posée de la même façon.
const REFERENCE_SELECT = `
  *,
  batch_steps(*, batch_substeps(id, texte, commentaire, order_index)),
  batch_ingredients(id, batch_step_id, name, unit, quantity, real_quantity, commentaire, order_index, removed)
`;

type Brut = {
  id: number;
  date_fin: string | null;
  planned_date: string | null;
  commentaire_global: string | null;
  factor: number | null;
  batch_steps: RefStep[] | null;
  batch_ingredients: RefIngredient[] | null;
};

type Supa = Awaited<ReturnType<typeof createClient>>;

function versReference(row: Brut): FourneeReference {
  return {
    id: row.id,
    date: row.date_fin ?? row.planned_date,
    commentaire_global: row.commentaire_global,
    lecon: lireLecon(row),
    facteur: row.factor && row.factor > 0 ? row.factor : null,
    batch_steps: (row.batch_steps ?? []).map((s) => ({ ...s, batch_substeps: s.batch_substeps ?? [] })),
    batch_ingredients: row.batch_ingredients ?? [],
  };
}

// Fournée de référence :
//   • la fournée source (`source_plan_id`, « Refaire ») si elle est lisible ;
//   • sinon la plus récente fournée `terminee` du membre sur la même recette,
//     hors la fournée courante.
async function lireReference(
  supabase: Supa,
  opts: { userId: string; recipeId: string | null; excludeId?: number | null; sourcePlanId?: number | null },
): Promise<FourneeReference | null> {
  if (opts.sourcePlanId != null) {
    const { data, error } = await supabase.from('batches').select(REFERENCE_SELECT).eq('id', opts.sourcePlanId).maybeSingle();
    if (error) console.error('getRemarques (source):', error.message);
    if (data) return versReference(data as unknown as Brut);
  }
  if (!opts.recipeId) return null;
  let q = supabase.from('batches').select(REFERENCE_SELECT).eq('user_id', opts.userId).eq('recipe_id', opts.recipeId).eq('status', 'terminee');
  if (opts.excludeId != null) q = q.neq('id', opts.excludeId);
  const { data, error } = await q
    .order('date_fin', { ascending: false, nullsFirst: false })
    .order('planned_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error('getRemarques:', error.message);
    return null;
  }
  const row = (data as unknown as Brut[] | null)?.[0];
  return row ? versReference(row) : null;
}

// Identifiant de la fournée terminée la plus récente de la recette.
async function lirePlusRecente(supabase: Supa, userId: string, recipeId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('batches')
    .select('id')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .eq('status', 'terminee')
    .order('date_fin', { ascending: false, nullsFirst: false })
    .order('planned_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error('getRemarques (plus récente):', error.message);
    return null;
  }
  return (data as { id: number }[] | null)?.[0]?.id ?? null;
}

// Choix du membre sur cette recette. `null` : table absente (migration pas
// jouée) — les gestes « garder / écarter » sont alors masqués.
async function lireDecisions(supabase: Supa, userId: string, recipeId: string): Promise<DecisionRemarque[] | null> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('remarques_gardees')
    .select('*')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) {
    // Table absente : silencieux (42P01 / PGRST205), le reste est journalisé.
    if (!/42P01|PGRST205|does not exist|Could not find the table/.test(`${error.code} ${error.message}`)) {
      console.error('getRemarques (choix):', error.message);
    }
    return null;
  }
  return (data ?? []) as DecisionRemarque[];
}

// Texte vivant des remarques gardées venues d'autres fournées : un
// commentaire corrigé depuis s'y reflète. Ligne introuvable (fournée
// supprimée) : la copie de `remarques_gardees` sert.
async function rafraichir(supabase: Supa, decisions: DecisionRemarque[], refId: number | null): Promise<DecisionRemarque[]> {
  const aLire = decisions.filter((d) => d.statut === 'gardee' && d.batch_id != null && d.batch_id !== refId);
  if (!aLire.length) return decisions;
  const ids = (n: DecisionRemarque['nature'][]) => [...new Set(aLire.filter((d) => n.includes(d.nature)).map((d) => d.ligne_id))];
  const [etapes, sousEtapes, ingredients, fournees] = await Promise.all([
    ids(['etape']).length ? supabase.from('batch_steps').select('*').in('id', ids(['etape'])) : null,
    ids(['sous_etape']).length ? supabase.from('batch_substeps').select('id, commentaire').in('id', ids(['sous_etape'])) : null,
    ids(['ingredient']).length
      ? supabase.from('batch_ingredients').select('id, commentaire, quantity, real_quantity, unit').in('id', ids(['ingredient']))
      : null,
    ids(['global', 'lecon']).length ? supabase.from('batches').select('*').in('id', ids(['global', 'lecon'])) : null,
  ]);
  const vivant = new Map<string, { texte: string | null; ecart?: string | null }>();
  for (const r of (etapes?.data ?? []) as { id: number; commentaire: string | null; ecart_produit_g?: number | null }[]) {
    vivant.set(`etape:${r.id}`, { texte: r.commentaire, ecart: libelleEcartProduit(r.ecart_produit_g) });
  }
  for (const r of (sousEtapes?.data ?? []) as { id: number; commentaire: string | null }[]) vivant.set(`sous_etape:${r.id}`, { texte: r.commentaire });
  for (const r of (ingredients?.data ?? []) as { id: number; commentaire: string | null; quantity: number | null; real_quantity: number | null; unit: string | null }[]) {
    vivant.set(`ingredient:${r.id}`, { texte: r.commentaire, ecart: ecartQuantite(r) });
  }
  for (const r of (fournees?.data ?? []) as { id: number; commentaire_global: string | null }[]) {
    vivant.set(`global:${r.id}`, { texte: r.commentaire_global });
    vivant.set(`lecon:${r.id}`, { texte: lireLecon(r) });
  }
  return decisions.map((d) => {
    const v = vivant.get(`${d.nature}:${d.ligne_id}`);
    if (!v) return d;
    return { ...d, texte: v.texte, ...(v.ecart !== undefined ? { ecart: v.ecart } : {}) };
  });
}

export type DonneesRemarques = {
  reference: FourneeReference | null;
  // Fournée terminée la plus récente du membre sur cette recette (la courante
  // exclue de rien) : ses remarques sont épinglées par défaut.
  plusRecenteId: number | null;
  decisions: DecisionRemarque[];
  // Table `remarques_gardees` lisible : les gestes peuvent être proposés.
  choixDisponibles: boolean;
};

// Tout ce que « La dernière fois » affiche pour un membre et une recette.
// Best-effort : un échec ne coûte que les remarques, jamais la page.
export async function getRemarques(opts: {
  userId: string;
  recipeId: string | null;
  excludeId?: number | null;
  sourcePlanId?: number | null;
}): Promise<DonneesRemarques> {
  const supabase = await createClient();
  const [reference, decisionsBrutes, plusRecenteId] = await Promise.all([
    lireReference(supabase, opts),
    opts.recipeId ? lireDecisions(supabase, opts.userId, opts.recipeId) : Promise.resolve(null),
    opts.recipeId ? lirePlusRecente(supabase, opts.userId, opts.recipeId) : Promise.resolve(null),
  ]);
  let decisions = decisionsBrutes ?? [];
  try {
    decisions = await rafraichir(supabase, decisions, reference?.id ?? null);
  } catch (e) {
    console.error('getRemarques (rafraîchir):', e);
  }
  return { reference, plusRecenteId, decisions, choixDisponibles: decisionsBrutes != null };
}

// Remarques de CHAQUE fournée d'une recette (essais d'un projet), par id de
// fournée : ce que le membre a constaté à cet essai, sans épingle ni règle
// d'affichage — lecture seule. Best-effort : un échec rend `{}`.
export async function getRemarquesEssais(recipeId: string): Promise<Record<number, Remarque[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('batches').select(REFERENCE_SELECT).eq('recipe_id', recipeId);
    if (error) {
      console.error('getRemarquesEssais:', error.message);
      return {};
    }
    const out: Record<number, Remarque[]> = {};
    for (const row of (data ?? []) as unknown as Brut[]) out[row.id] = remarquesDeFournee(versReference(row));
    return out;
  } catch (e) {
    console.error('getRemarquesEssais:', e);
    return {};
  }
}
