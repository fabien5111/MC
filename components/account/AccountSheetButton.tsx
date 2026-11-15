'use client';

// Déclencheur du tiroir Compte sous 1024 px : l'**avatar de l'en-tête**
// (`variante="entete"`, proposition D de l'ergonomie mobile — le profil a
// quitté la barre basse, dont la fente centrale sert désormais à agir). Ce
// n'est pas une destination : il ouvre le tiroir Compte en feuille remontante,
// avec le même contenu qu'au bureau. C'est le geste déjà employé ailleurs dans le
// produit pour un panneau secondaire sur petit écran (critères de la recherche
// avancée, sommaire de la fiche recette), et la feuille mutualisée sait déjà
// piéger le focus, verrouiller le défilement et rendre le focus au déclencheur.
//
// D'où un `<button>` et non un `<a>` : ce qui n'emmène nulle part ne doit pas
// se présenter comme un lien.
import { useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { AccountMenuItems, type AccountMenuData } from '@/components/account/AccountMenuItems';

export function AccountSheetButton({
  data,
  className,
  variante = 'fente',
}: {
  data: AccountMenuData;
  className?: string;
  // `'entete'` : avatar rond seul (36 px, comme l'avatar du bureau), sans
  // libellé. `'fente'` : picto + « Profil », l'ancienne fente de la barre basse.
  variante?: 'fente' | 'entete';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="tiroir-compte"
        onClick={() => setOpen(true)}
        aria-label={variante === 'entete' ? 'Mon compte' : undefined}
        className={className}
      >
        {variante === 'entete' ? (
          <span className="block h-9 w-9 overflow-hidden rounded-pill border border-outline-variant bg-surface-container">
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
              <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-[22px] text-on-surface-variant">
                person
              </span>
            )}
          </span>
        ) : data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img
            src={data.avatarUrl}
            alt=""
            className="h-[23px] w-[23px] rounded-pill border border-outline-variant object-cover"
          />
        ) : (
          <span className="material-symbols-outlined text-[23px]">person</span>
        )}
        {variante === 'fente' && <span className="mt-1 font-label-md text-[10px]">Profil</span>}
      </button>

      <BottomSheet
        id="tiroir-compte"
        open={open}
        onClose={() => setOpen(false)}
        breakpoint="lg"
        label="Mon compte"
        sheetClassName="max-h-[80vh] overflow-y-auto"
      >
        {/* Réserve d'encoche : la feuille va jusqu'au bas de l'écran, la
            dernière entrée ne doit pas se loger sous l'indicateur d'accueil. */}
        <div className="pb-[env(safe-area-inset-bottom)]">
          <AccountMenuItems data={data} onNavigate={() => setOpen(false)} />
        </div>
      </BottomSheet>
    </>
  );
}
