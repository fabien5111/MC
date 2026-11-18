'use client';

// Bilan de la fournée (JEP-381) : question posée à la clôture, enregistrée
// dans `batches.commentaire_global` — le même champ que le « Commentaire
// global » du résumé, qui reste modifiable ensuite. Écrit à part du statut,
// côté navigateur (RLS `owns_plan()`). (L'ancien « À retenir »,
// `batches.lecon`, n'est plus ni posé ni lu.)
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { ligneDecision, normaliserBilan, phraseDejaValidee, type Remarque, type StatutRemarque } from '@/lib/batch-lecons';

// Écrit le bilan ; renvoie le message d'erreur, ou `null` si tout va bien.
export async function enregistrerBilan(batchId: number, valeur: string | null): Promise<string | null> {
  const bilan = normaliserBilan(valeur);
  const { error } = await createClient().from('batches').update({ commentaire_global: bilan }).eq('id', batchId);
  if (error) return error.message;
  if (bilan) trackEvent('saisir_bilan');
  return null;
}

// « Fournée validée » (`batches.refaisable`, colonne posée par `psql`) :
// le membre dit que tout s'est bien passé. Écrit à part ; renvoie le message
// d'erreur, `null` si tout va bien. Colonne absente (migration pas jouée) :
// `colonneAbsente` — l'appelant n'affiche alors ni case ni alerte.
export function colonneRefaisableAbsente(message: string | null): boolean {
  return !!message && /refaisable/i.test(message);
}
export async function enregistrerRefaisable(batchId: number, valeur: boolean): Promise<string | null> {
  const { error } = await createClient().from('batches').update({ refaisable: valeur } as never).eq('id', batchId);
  return error ? error.message : null;
}

// Autres fournées de la même recette déjà validées (colonne `refaisable`).
// Best-effort : lecture en échec ou colonne absente (migration pas jouée) →
// aucune, la question reste celle d'origine.
async function autresFourneesValidees(batchId: number): Promise<{ date_fin: string | null; planned_date: string | null }[]> {
  try {
    const supabase = createClient();
    const { data: courante } = await supabase.from('batches').select('recipe_id').eq('id', batchId).maybeSingle();
    const recipeId = (courante as { recipe_id: string | null } | null)?.recipe_id;
    if (!recipeId) return [];
    const { data, error } = await supabase
      .from('batches')
      .select('date_fin, planned_date, refaisable' as never)
      .eq('recipe_id', recipeId)
      .neq('id', batchId)
      .eq('refaisable' as never, true as never);
    if (error) return [];
    return (data as unknown as { date_fin: string | null; planned_date: string | null }[]) ?? [];
  } catch {
    return [];
  }
}

// Phrase « La fournée du 03/11 est déjà validée… » pour l'écran de fin de
// fournée (vide si aucune autre fournée de la recette n'est validée).
export async function phraseAutresValidees(batchId: number): Promise<string> {
  return phraseDejaValidee(await autresFourneesValidees(batchId));
}

// ── Garder / écarter une remarque (`remarques_gardees`) ─────────────────
// Écrit sous la session du membre (RLS : ses propres lignes). `statut` nul :
// le choix est retiré, la remarque redevient « par défaut ».
export async function enregistrerChoix(
  userId: string,
  recipeId: string,
  r: Remarque,
  statut: StatutRemarque | null,
): Promise<string | null> {
  // Table absente des types générés : accès non typé.
  const table = (createClient() as unknown as { from: (t: string) => any }).from('remarques_gardees');
  if (statut == null) {
    const { error } = await table.delete().eq('user_id', userId).eq('nature', r.nature).eq('ligne_id', r.ligneId);
    return error ? error.message : null;
  }
  const { error } = await table.upsert({ ...ligneDecision(r, statut), user_id: userId, recipe_id: recipeId }, { onConflict: 'user_id,nature,ligne_id' });
  return error ? error.message : null;
}
