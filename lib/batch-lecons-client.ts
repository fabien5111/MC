'use client';

// « À retenir pour la prochaine fois » (JEP-381, lot 2) : saisie et
// enregistrement de `batches.lecon`, côté navigateur (RLS `owns_plan()`).
//
// La colonne est posée à la main (DDL par psql, nœud 216075) et absente des
// types générés : écrite à part, jamais avec le statut. Avant la migration,
// la question n'est pas posée du tout (sonde `select('lecon')`), pour ne pas
// faire saisir un texte qui serait perdu.
import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { trackEvent } from '@/lib/analytics';
import { LECON_MAX, normaliserLecon } from '@/lib/batch-lecons';

const QUESTION = 'Qu’est-ce que vous changeriez la prochaine fois ?\n\nFacultatif — ce rappel s’affichera au lancement de votre prochaine fournée de cette recette.';

// La colonne `lecon` existe-t-elle ? Une lecture d'une seule ligne, faite
// seulement au moment de poser la question.
async function colonneDisponible(batchId: number): Promise<boolean> {
  const { error } = await createClient()
    .from('batches')
    .select('lecon' as never)
    .eq('id', batchId)
    .limit(1);
  return !error;
}

// Écrit la leçon ; renvoie le message d'erreur, ou `null` si tout va bien.
export async function enregistrerLecon(batchId: number, valeur: string | null): Promise<string | null> {
  const lecon = normaliserLecon(valeur);
  const { error } = await createClient()
    .from('batches')
    .update({ lecon } as never)
    .eq('id', batchId);
  if (error) return error.message;
  if (lecon) trackEvent('saisir_lecon');
  return null;
}

// Pose la question puis enregistre. Renvoie la leçon enregistrée (`null` =
// effacée), ou `undefined` si rien n'a été écrit (annulation, colonne
// absente, échec — signalé par une alerte).
export function useDemanderLecon() {
  const dialog = useDialog();
  return useCallback(
    async (batchId: number, actuelle: string | null = null, sonder = true): Promise<string | null | undefined> => {
      if (sonder && !(await colonneDisponible(batchId))) return undefined;
      const saisie = await dialog.prompt(QUESTION, {
        defaultValue: actuelle ?? '',
        maxLength: LECON_MAX,
        placeholder: 'Ex. : cuire 3 min de moins, mettre 20 g de sucre en moins…',
      });
      if (saisie == null) return undefined;
      const lecon = normaliserLecon(saisie);
      // Rien saisi à la clôture : rien à écrire.
      if (!lecon && !actuelle) return undefined;
      if (lecon === actuelle) return undefined;
      const erreur = await enregistrerLecon(batchId, lecon);
      if (erreur) {
        dialog.alert('La note « À retenir » n’a pas pu être enregistrée : ' + erreur);
        return undefined;
      }
      return lecon;
    },
    [dialog],
  );
}
