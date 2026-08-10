import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProfilRedirect } from '@/app/profil/ProfilRedirect';

export const metadata: Metadata = { title: 'Redirection…', robots: { index: false, follow: false } };

// `/profil` n'existe plus comme écran : son contenu est parti dans ses vraies
// maisons — recettes et favoris au **carnet**, planning, sessions et courses
// **en cuisine**, réglages du compte à `/reglages`.
//
// La page survit uniquement comme redirection, parce que ses ancres circulent :
// `#planning`, `#planning-jours`, `#courses`, `#sessions` étaient la cible de
// liens internes, de marque-pages et de l'historique des navigateurs. Les
// abandonner enverrait ces liens sur un 404 des mois durant.
//
// Le tri se fait **côté navigateur** : un fragment d'URL n'est jamais transmis
// au serveur, un `redirect()` de Server Component ne pourrait donc pas le lire
// et renverrait tout le monde au même endroit.
export default function ProfilPage() {
  // `useSearchParams` impose une frontière de suspense au pré-rendu : sans
  // elle, la page entière bascule en rendu client au build.
  return (
    <Suspense fallback={null}>
      <ProfilRedirect />
    </Suspense>
  );
}
