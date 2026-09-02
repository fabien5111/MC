import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { NavigationSpinner } from '@/components/NavigationSpinner';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { InstallPwaBanner } from '@/components/InstallPwaBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ImpersonationProvider } from '@/components/ImpersonationProvider';
import { VisitTracker } from '@/components/VisitTracker';
import { DialogProvider } from '@/components/Dialog';
import { getImpersonationContext } from '@/lib/impersonation';
import { APPLE_SPLASH_SCREENS } from '@/lib/apple-splash-screens';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

export const metadata: Metadata = {
  // Résout les URL relatives des pages (canonique, OpenGraph…) en URL
  // absolues — sans ça, Next les résout sur `localhost:3000` au build.
  metadataBase: new URL(siteUrl()),
  title: 'Je pâtisse !',
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
        {/* Splash natif iOS (cf. handoff design) : Safari ne lit pas le
            manifeste pour cet écran, il faut une image par format d'appareil. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Je pâtisse" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/apple-180.png" />
        {APPLE_SPLASH_SCREENS.map((screen) => (
          <link key={screen.href} rel="apple-touch-startup-image" media={screen.media} href={screen.href} />
        ))}
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
        {/* Enregistre le service worker du site et purge tout reliquat (cf.
            components/ServiceWorkerRegistrar.tsx). */}
        <ServiceWorkerRegistrar />
        {/* Bannière d'installation PWA — visiteur compris, cf. son en-tête. */}
        <InstallPwaBanner />
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
            <VisitTracker />
            {children}
          </ImpersonationProvider>
        </DialogProvider>
      </body>
    </html>
  );
}
