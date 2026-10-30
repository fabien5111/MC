'use client';

// Dernier filet : erreur levée dans le layout racine ou avant l'hydratation
// (typiquement un fichier JavaScript qui n'arrive pas). Sans ce fichier, Next
// affiche « Application error: a client-side exception has occurred », sans
// issue. Remplace le layout : `<html>` et `<body>` obligatoires, et styles en
// ligne (la feuille de style du site n'est pas garantie chargée).
import { useEffect } from 'react';
import { rechargerSiChunk } from '@/lib/rechargement-chunk';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Erreur globale :', error);
    rechargerSiChunk(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#fff8f7',
          color: '#300a12',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Cette page n&apos;a pas pu s&apos;afficher</h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.5 }}>
            Un problème de connexion a interrompu le chargement. Rechargez la page pour réessayer.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: '2px solid #300a12',
              background: 'transparent',
              color: '#300a12',
              borderRadius: 999,
              padding: '12px 32px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Recharger
          </button>
          <p style={{ marginTop: 24 }}>
            {/* Lien natif voulu : rechargement complet, le routeur peut être hors d'usage. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: '#300a12' }}>
              Retour à l&apos;accueil
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
