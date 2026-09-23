import type { Metadata } from 'next';
import { ErrorShell } from '@/components/ErrorShell';

// Page 404 du site. Couvre les deux cas d'un coup :
//  - une URL qui ne correspond à aucune route (frappe, marque-page périmé,
//    lien externe cassé) ;
//  - les `notFound()` appelés par les pages (`/u/[handle]`, `/blog/[slug]`,
//    `/fournee/[id]`, `/execution/[id]`, `/reglages/mes-demandes/…` et tout
//    le back-office), qui servaient jusqu'ici la page nue de Next.
//
// Aucune lecture de session ici : ce fichier est pré-rendu au build pour les
// URL sans route, et y lire les cookies ferait échouer la construction.
// Cf. le commentaire en tête de `components/ErrorShell.tsx`.
export const metadata: Metadata = {
  title: 'Page introuvable | Je pâtisse !',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorShell eyebrow="Erreur 404" title="Cette page n'existe pas">
      <p>
        L&apos;adresse demandée ne correspond à rien sur le site. Elle a pu être mal recopiée, ou
        désigner une recette, un article ou une fournée qui n&apos;existe plus.
      </p>
      <p>Voici par où reprendre.</p>
    </ErrorShell>
  );
}
