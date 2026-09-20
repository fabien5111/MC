'use client';

// Fil d'Ariane des écrans de détail (fiche recette, fournée, profil public) :
// un retour contextuel vers l'écran de LISTE d'où l'on vient (résultats de
// recherche, carnet, profil, blog, en cuisine) quand il est connu — sinon le
// repli statique propre à l'écran (`fallbackHref`/`fallbackLabel`).
//
// Cf. `components/PreviousPathProvider.tsx` pour la mécanique (chemin
// précédent gardé en mémoire pour la session de navigation) et
// `lib/return-nav.ts` pour la table des écrans de liste reconnus.
import Link from 'next/link';
import { usePreviousPath } from '@/components/PreviousPathProvider';
import { returnOriginFor } from '@/lib/return-nav';

export function RetourContextuel({
  fallbackHref,
  fallbackLabel,
  currentLabel,
  className = '',
}: {
  fallbackHref: string;
  fallbackLabel: string;
  // Dernier maillon du fil, toujours le titre de l'écran courant.
  currentLabel: string;
  className?: string;
}) {
  const previous = usePreviousPath();
  const origin = returnOriginFor(previous);

  return (
    <nav
      className={`flex items-center gap-2 text-on-surface-variant font-label-md text-[12px] ${className}`}
    >
      <Link className="hover:text-primary" href={origin?.href ?? fallbackHref}>
        {origin?.label ?? fallbackLabel}
      </Link>
      <span className="material-symbols-outlined text-[14px]">chevron_right</span>
      <span className="text-primary">{currentLabel}</span>
    </nav>
  );
}
