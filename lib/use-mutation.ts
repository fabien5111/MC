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
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logImpersonationAction, useImpersonation } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { translateQuotaError } from '@/lib/quota-message-client';

// Forme minimale d'un retour supabase-js. `null` permet d'abandonner sans
// alerte (ex. redirection vers /connexion faute de session active).
type WriteResult = { error: { message: string } | null };
type Write = () => PromiseLike<WriteResult | null>;

// Un refus de quota (`mc_enforce_stock`, `mc_enforce_project_access`, et tout
// futur trigger du même type) arrive ici comme n'importe quelle erreur
// Postgres — `useMutation` étant le point de passage unique de toutes les
// écritures du site, c'est le seul endroit où le traduire compte de le
// faire une fois pour toutes plutôt que dans chaque appelant. Les écritures
// hors périmètre du hook (CreerForm, la création d'une fournée) appellent
// `translateQuotaError` directement — cf. lib/quota-message-client.ts.

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

  // Instrumentation temporaire — voir NavigationSpinner.tsx : mesure séparé-
  // ment le temps d'écriture réseau et celui de la resynchronisation
  // (`router.refresh()`), pour savoir laquelle des deux domine la durée
  // pendant laquelle `busy` garde l'overlay affiché. La durée de la
  // resynchronisation ne peut se mesurer qu'en observant `pending` repasser
  // à `false` — un minuteur posé dans le callback de `startTransition` ne
  // couvrirait que le tick suivant, pas le rendu réel, souvent bien plus
  // long. À retirer une fois la mesure faite sur dev.jepatisse.com.
  const refreshTiming = useRef<{ start: number; label: string } | null>(null);
  useEffect(() => {
    if (pending || !refreshTiming.current) return;
    const { start, label } = refreshTiming.current;
    refreshTiming.current = null;
    console.debug(`[mutation-timing] ${label} — resynchro ${Math.round(performance.now() - start)}ms`);
  }, [pending]);

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
      const label = options.errorLabel ?? options.confirm ?? 'Écriture';
      const writeStart = performance.now();
      setWriting(true);
      try {
        const res = await write();
        const writeMs = Math.round(performance.now() - writeStart);
        if (!res) {
          console.debug(`[mutation-timing] ${label} — abandon après ${writeMs}ms`);
          return false; // abandon volontaire
        }
        if (res.error) {
          console.debug(`[mutation-timing] ${label} — erreur après ${writeMs}ms`);
          const educatif = await translateQuotaError(res.error.message);
          dialog.alert(educatif ?? `${options.errorLabel ?? 'Erreur'} : ${res.error.message}`);
          return false;
        }
        if (impersonation) {
          logImpersonationAction('write', options.errorLabel ?? options.confirm ?? 'Écriture');
        }
        if (options.refresh !== false) {
          console.debug(`[mutation-timing] ${label} — écriture ${writeMs}ms, resynchro lancée`);
          refreshTiming.current = { start: performance.now(), label };
          startTransition(() => router.refresh());
        } else {
          console.debug(`[mutation-timing] ${label} — écriture ${writeMs}ms (sans resynchro)`);
        }
        return true;
      } catch (e) {
        const brut = (e as Error).message || 'écriture impossible';
        const educatif = await translateQuotaError(brut);
        dialog.alert(educatif ?? `${options.errorLabel ?? 'Erreur'} : ${brut}`);
        return false;
      } finally {
        // Groupé avec le passage à `pending` par React : `busy` ne retombe pas
        // entre les deux, le spinner ne clignote pas.
        setWriting(false);
      }
    },
    [router, impersonation, dialog],
  );

  // Resynchronisation seule, sans écriture. Sert quand l'écriture a eu lieu
  // dans un composant qui se démonte juste après (une fenêtre modale qui se
  // ferme) : la transition de ce composant disparaît avec lui, le spinner
  // s'éteint et les modifications n'apparaissent qu'une seconde plus tard.
  // Le parent, lui, reste monté — c'est donc à lui de porter le
  // rafraîchissement, et le `busy` qui va avec.
  const refresh = useCallback(() => {
    refreshTiming.current = { start: performance.now(), label: 'refresh() explicite' };
    startTransition(() => router.refresh());
  }, [router]);

  return { busy: writing || pending, mutate, refresh };
}
