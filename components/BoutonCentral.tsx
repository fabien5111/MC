'use client';

// Bouton central de la barre basse (proposition D de l'ergonomie mobile,
// étape 2) : « le bouton du milieu sert à agir ». Il change selon l'écran :
//  - **Actions** quand l'écran en déclare (`lib/actions-ecran.ts`, posées par
//    `RecipeToc` : fiche recette, fournée, /creer, relecture, projet) ;
//  - **Créer** partout ailleurs (recette, import, projet — les entrées du menu
//    « Créer » du carnet, désormais atteignables de tout le site) ;
//  - **Se connecter** pour un visiteur.
// Le libellé est toujours écrit sous le rond : un bouton qui change de sens
// selon l'écran doit le dire.
//
// `indice` : la page sait, au rendu serveur, qu'elle déclarera des actions.
// Sans lui, le bouton s'afficherait « Créer » jusqu'à l'hydratation puis
// basculerait — un clignotement sur chaque fiche recette. Une fois monté, seul
// le magasin fait foi : un écran qui n'a finalement aucune action (visiteur
// sans droit d'édition, par exemple) retombe sur « Créer ».
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActionsEcran } from '@/lib/actions-ecran';
import { FeuilleActions } from '@/components/recipe/RecipeToc';
import { BottomSheet } from '@/components/BottomSheet';
import { Entrees } from '@/components/carnet/CreateMenuButton';

const ROND =
  'flex h-14 w-14 items-center justify-center rounded-pill border-4 border-surface-container-low bg-primary text-on-primary shadow-[0_6px_14px_-6px_rgba(48,10,18,0.6)] transition-transform active:scale-95';
const LIBELLE = 'nav-label mt-0.5 whitespace-nowrap font-label-md text-[10px] font-semibold leading-tight text-primary';

export function BoutonCentral({ connecte, indice }: { connecte: boolean; indice?: 'actions' }) {
  const actions = useActionsEcran();
  const [monte, setMonte] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  // Droit `mode_projet`, lu à l'ouverture du menu « Créer » seulement
  // (`/api/droits/mode-projet`) : `null` = pas encore lu, entrée grisée.
  const [peutProjet, setPeutProjet] = useState<boolean | null>(null);

  useEffect(() => setMonte(true), []);

  const modeActions = monte ? actions !== null : indice === 'actions';

  useEffect(() => {
    if (!ouvert || modeActions || peutProjet !== null) return;
    let annule = false;
    fetch('/api/droits/mode-projet', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { autorise: false }))
      .then((d: { autorise?: boolean }) => {
        if (!annule) setPeutProjet(d.autorise === true);
      })
      .catch(() => {
        if (!annule) setPeutProjet(false);
      });
    return () => {
      annule = true;
    };
  }, [ouvert, modeActions, peutProjet]);

  if (!connecte) {
    return (
      <Link href="/connexion" className="relative -top-3.5 flex min-w-0 flex-col items-center">
        <span className={ROND}>
          <span className="material-symbols-outlined text-[26px]" aria-hidden>
            person
          </span>
        </span>
        <span className={LIBELLE}>Se connecter</span>
      </Link>
    );
  }

  const libelle = modeActions ? 'Actions' : 'Créer';

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-controls="feuille-bouton-central"
        aria-label={modeActions ? 'Actions sur cet écran' : 'Créer une recette, importer ou créer un projet'}
        // Indice serveur sans actions encore déclarées : rien à ouvrir.
        disabled={modeActions && !actions}
        onClick={() => setOuvert(true)}
        className="relative -top-3.5 flex min-w-0 flex-col items-center disabled:opacity-60"
      >
        <span className={ROND}>
          {modeActions ? (
            <span className="material-symbols-outlined text-[26px]" aria-hidden>
              apps
            </span>
          ) : (
            <span className="material-symbols-outlined text-[28px]" aria-hidden>
              add
            </span>
          )}
        </span>
        <span className={LIBELLE}>{libelle}</span>
      </button>

      {modeActions ? (
        <FeuilleActions
          id="feuille-bouton-central"
          open={ouvert}
          onClose={() => setOuvert(false)}
          breakpoint="lg"
          actions={actions ?? []}
        />
      ) : (
        <BottomSheet
          id="feuille-bouton-central"
          open={ouvert}
          onClose={() => setOuvert(false)}
          breakpoint="lg"
          label="Créer"
          sheetClassName="max-h-[80vh] overflow-y-auto"
        >
          <div className="pb-[env(safe-area-inset-bottom)]">
            <Entrees peutProjet={peutProjet === true} onNavigate={() => setOuvert(false)} grand />
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="mt-1 w-full border-t border-outline-variant px-5 py-4 text-[14px] font-semibold text-on-surface-variant"
            >
              Annuler
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
