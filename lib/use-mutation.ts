'use client';

// Écriture Supabase depuis un composant client, puis resynchronisation du
// rendu serveur.
//
// Motif systématique de l'application : toutes les écritures partent du
// navigateur (client Supabase, RLS via la session en cookies) tandis que
// toutes les lectures sont rendues côté serveur. Sans invalidation explicite
// après une écriture, les vues déjà rendues (carnet, favoris, listes de
// courses, compteurs du profil…) restent figées jusqu'à un rechargement
// complet de la page.
//
// `busy` couvre l'opération complète — écriture réseau ET retour du rendu
// serveur (cf. la transition plus bas) : le spinner ne s'éteint qu'une fois
// les modifications réellement visibles.
//
// À utiliser pour toute nouvelle mutation : le router.refresh() n'est plus à
// retenir composant par composant.
//
// Hors périmètre : les formulaires enfants qui remontent un `onSaved()` au
// parent (celui-ci rafraîchit déjà), et les enregistrements multi-écritures
// avec navigation (éditeur de recette, relecture d'import) dont la gestion
// d'erreur est spécifique.
//
// Impersonation : quand la session courante est une connexion « en tant que »
// en lecture seule, aucune écriture n'est émise (message explicite + trace
// dans le journal d'audit). Les écritures abouties d'une session en mode
// « modification » sont, elles, tracées.
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logImpersonationAction, useImpersonation } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';

// Forme minimale d'un retour supabase-js. `null` permet d'abandonner sans
// alerte (ex. redirection vers /connexion faute de session active).
type WriteResult = { error: { message: string } | null };
type Write = () => PromiseLike<WriteResult | null>;

export type MutateOptions = {
  // Texte du confirm() préalable ; l'écriture est abandonnée si l'utilisateur
  // refuse (aucune requête n'est émise).
  confirm?: string;
  // Préfixe du message d'alerte en cas d'échec (défaut : « Erreur »).
  errorLabel?: string;
  // Resynchroniser le rendu serveur après succès (défaut : true). À passer à
  // false uniquement pour une écriture très fréquente (coche à la volée…)
  // dont l'affichage est déjà tenu à jour localement.
  refresh?: boolean;
};

export function useMutation() {
  const router = useRouter();
  const impersonation = useImpersonation();
  const dialog = useDialog();
  const [writing, setWriting] = useState(false);
  // `router.refresh()` ne rend pas de promesse : émis tel quel, l'écriture
  // paraissait finie (spinner éteint) alors que le rendu serveur n'était pas
  // encore revenu — les modifications apparaissaient une seconde plus tard,
  // sur une interface redevenue active. Enveloppé dans une transition,
  // `pending` reste vrai jusqu'à ce que le nouveau rendu soit appliqué : le
  // spinner couvre enfin toute l'opération, écriture ET resynchronisation.
  const [pending, startTransition] = useTransition();

  // Renvoie true si l'écriture a réussi — permet à l'appelant d'annuler une
  // mise à jour optimiste en cas d'échec.
  const mutate = useCallback(
    async (write: Write, options: MutateOptions = {}): Promise<boolean> => {
      // Session d'impersonation en lecture seule : rien n'est envoyé.
      if (impersonation?.mode === 'read_only') {
        logImpersonationAction('write_blocked', options.errorLabel ?? options.confirm ?? 'Écriture');
        dialog.alert(
          'Session de consultation : vous êtes connecté en tant que ' +
            `${impersonation.targetName} en lecture seule. Aucune modification n'est possible.`,
        );
        return false;
      }
      if (options.confirm && !(await dialog.confirm(options.confirm))) return false;
      setWriting(true);
      try {
        const res = await write();
        if (!res) return false; // abandon volontaire
        if (res.error) {
          dialog.alert(`${options.errorLabel ?? 'Erreur'} : ${res.error.message}`);
          return false;
        }
        if (impersonation) {
          logImpersonationAction('write', options.errorLabel ?? options.confirm ?? 'Écriture');
        }
        if (options.refresh !== false) startTransition(() => router.refresh());
        return true;
      } catch (e) {
        dialog.alert(`${options.errorLabel ?? 'Erreur'} : ${(e as Error).message || 'écriture impossible'}`);
        return false;
      } finally {
        // Groupé avec le passage à `pending` par React : `busy` ne retombe pas
        // entre les deux, le spinner ne clignote pas.
        setWriting(false);
      }
    },
    [router, impersonation, dialog],
  );

  return { busy: writing || pending, mutate };
}
