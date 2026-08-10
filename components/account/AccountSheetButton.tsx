'use client';

// Cinquième fente de la barre basse : « Profil ». Elle **n'est pas une
// destination** — elle ouvre le tiroir Compte en feuille remontante, avec le
// même contenu qu'au bureau. C'est le geste déjà employé ailleurs dans le
// produit pour un panneau secondaire sur petit écran (critères de la recherche
// avancée, sommaire de la fiche recette), et la feuille mutualisée sait déjà
// piéger le focus, verrouiller le défilement et rendre le focus au déclencheur.
//
// D'où un `<button>` et non un `<a>` : ce qui n'emmène nulle part ne doit pas
// se présenter comme un lien.
import { useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { AccountMenuItems, type AccountMenuData } from '@/components/account/AccountMenuItems';

export function AccountSheetButton({ data, className }: { data: AccountMenuData; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="tiroir-compte"
        onClick={() => setOpen(true)}
        className={className}
      >
        {data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img
            src={data.avatarUrl}
            alt=""
            className="h-[23px] w-[23px] rounded-pill border border-outline-variant object-cover"
          />
        ) : (
          <span className="material-symbols-outlined text-[23px]">person</span>
        )}
        <span className="mt-1 font-label-md text-[10px]">Profil</span>
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
