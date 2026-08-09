import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { NavigationSpinner } from '@/components/NavigationSpinner';
import { ServiceWorkerCleanup } from '@/components/ServiceWorkerCleanup';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ImpersonationProvider } from '@/components/ImpersonationProvider';
import { DialogProvider } from '@/components/Dialog';
import { getImpersonationContext } from '@/lib/impersonation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Maryse Club',
  description:
    'La haute pâtisserie à la maison — créez, partagez et maîtrisez vos recettes.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#300a12',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Impersonation en cours (admin connecté « en tant que » ce membre) :
  // résolue ici pour être disponible sur toutes les pages — bandeau persistant
  // et bridage des composants client en lecture seule.
  const impersonation = await getImpersonationContext();

  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Work+Sans:wght@400;500;600;700&family=Parisienne&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        data-impersonation={impersonation?.mode}
        className="font-body-md text-body-md bg-background text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed"
      >
        {/* Overlay de chargement superposé pendant les navigations internes.
            `useSearchParams` impose une frontière Suspense côté rendu. */}
        <Suspense fallback={null}>
          <NavigationSpinner />
        </Suspense>
        {/* Purge l'ancien service worker de la version vanilla (cf. public/sw.js). */}
        <ServiceWorkerCleanup />
        {/* Remplace window.alert()/confirm() par une modale cohérente avec le
            design du site (cf. components/Dialog.tsx) — englobe tout le reste
            pour que useWriteGuard/useMutation, montés plus bas, y aient accès. */}
        <DialogProvider>
          <ImpersonationProvider
            value={
              impersonation
                ? {
                    sessionId: impersonation.sessionId,
                    mode: impersonation.mode,
                    targetName: impersonation.targetName,
                  }
                : null
            }
          >
            {impersonation && (
              <ImpersonationBanner targetName={impersonation.targetName} mode={impersonation.mode} />
            )}
            {children}
          </ImpersonationProvider>
        </DialogProvider>
      </body>
    </html>
  );
}
