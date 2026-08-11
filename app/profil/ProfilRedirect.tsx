'use client';

// Redirection des anciennes adresses `/profil`, ancres comprises.
//
// Un fragment (`#planning`) n'est pas envoyé au serveur : seul le navigateur le
// connaît, d'où ce composant client plutôt qu'un `redirect()` de page. Il ne
// rend rien d'autre que le voile de chargement du produit — l'écran ne doit pas
// donner l'impression d'être une étape, juste celle d'un instant.
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';

// Ancres qui parlaient de préparation, de planning ou de courses : elles vont
// toutes « En cuisine ». Les deux vues du planning y sont conservées à
// l'identique, `CuisineContent` les relit dans le hash.
const VERS_CUISINE: Record<string, string> = {
  '#planning': '/en-cuisine#planning',
  '#planning-jours': '/en-cuisine#planning-jours',
  '#sessions': '/en-cuisine',
  '#courses': '/en-cuisine',
};

export function ProfilRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const hash = location.hash;
    // `?impersonation=lecture-seule` : motif de refus posé par
    // `requireWritableSession`, dont la cible est désormais les réglages.
    if (params.get('impersonation')) {
      router.replace(`/reglages?impersonation=${params.get('impersonation')}`);
      return;
    }
    // `#courses-12` et consorts : on compare sur le préfixe, ces ancres ont
    // circulé avec un identifiant de liste accolé.
    const cuisine = VERS_CUISINE[hash] ?? (hash.startsWith('#courses') ? '/en-cuisine' : null);
    // Tout le reste — y compris l'absence d'ancre et l'ancien onglet des
    // favoris — est du carnet.
    router.replace(cuisine ?? '/carnet');
  }, [router, params]);

  return <LoadingOverlay visible label="Redirection…" />;
}
