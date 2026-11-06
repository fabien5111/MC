'use client';

// Bilan de la fournée (JEP-381) : question posée à la clôture, enregistrée
// dans `batches.commentaire_global` — le même champ que le « Commentaire
// global » du résumé, qui reste modifiable ensuite. Écrit à part du statut,
// côté navigateur (RLS `owns_plan()`). (L'ancien « À retenir »,
// `batches.lecon`, n'est plus ni posé ni lu.)
import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { trackEvent } from '@/lib/analytics';
import { BILAN_MAX, ligneDecision, normaliserBilan, phraseDejaValidee, type Remarque, type StatutRemarque } from '@/lib/batch-lecons';

const QUESTION = 'Un commentaire sur cette fournée ?\n\nFacultatif — bilan de la fournée, ce que vous changeriez la prochaine fois… Il s’affichera au lancement de votre prochaine fournée de cette recette et reste modifiable depuis le résumé.';

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

// Question de clôture : « Tout s'est bien passé ? » Renvoie `true` si le
// membre a marqué la fournée refaisable (écrit), `undefined` sinon.
export function useDemanderRefaisable() {
  const dialog = useDialog();
  return useCallback(
    async (batchId: number): Promise<boolean | undefined> => {
      const deja = phraseDejaValidee(await autresFourneesValidees(batchId));
      const oui = await dialog.confirm(
        'Tout s’est bien passé ?\n\nValidez cette fournée : vous la retrouverez avec un bouton « Refaire » sur la fiche de la recette, et vous choisirez les retours à garder pour les prochaines fournées.' +
          (deja ? '\n\n' + deja : ''),
        { okLabel: 'Oui, valider la fournée', cancelLabel: 'Non' },
      );
      if (!oui) return undefined;
      const erreur = await enregistrerRefaisable(batchId, true);
      if (erreur) {
        if (!colonneRefaisableAbsente(erreur)) dialog.alert('La marque n’a pas pu être enregistrée : ' + erreur);
        return undefined;
      }
      return true;
    },
    [dialog],
  );
}

// Pose la question puis enregistre. Renvoie le bilan enregistré (`null` =
// effacé), ou `undefined` si rien n'a été écrit (annulation, rien de saisi,
// échec — signalé par une alerte).
export function useDemanderBilan() {
  const dialog = useDialog();
  return useCallback(
    async (batchId: number, actuel: string | null = null): Promise<string | null | undefined> => {
      const saisie = await dialog.prompt(QUESTION, {
        defaultValue: actuel ?? '',
        maxLength: BILAN_MAX,
        placeholder: 'Ex. : cuire 3 min de moins, mettre 20 g de sucre en moins…',
      });
      if (saisie == null) return undefined;
      const bilan = normaliserBilan(saisie);
      if (bilan === normaliserBilan(actuel)) return undefined;
      const erreur = await enregistrerBilan(batchId, bilan);
      if (erreur) {
        dialog.alert('Le bilan de la fournée n’a pas pu être enregistré : ' + erreur);
        return undefined;
      }
      return bilan;
    },
    [dialog],
  );
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
