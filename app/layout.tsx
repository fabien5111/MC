import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { playfairDisplay, workSans, parisienne } from '@/app/fonts';
import { NavigationSpinner } from '@/components/NavigationSpinner';
import { PreviousPathProvider } from '@/components/PreviousPathProvider';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { InstallPwaBanner } from '@/components/InstallPwaBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ImpersonationProvider } from '@/components/ImpersonationProvider';
import { VisitTracker } from '@/components/VisitTracker';
import { CookieConsent } from '@/components/CookieConsent';
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
  // Carte d'aperçu des partages (JEP-21) — l'image vient de
  // `app/opengraph-image.tsx`, que Next associe d'office.
  openGraph: {
    type: 'website',
    siteName: 'Je pâtisse !',
    locale: 'fr_FR',
    title: 'Je pâtisse !',
    description: 'La haute pâtisserie à la maison — créez, partagez et maîtrisez vos recettes.',
  },
  twitter: { card: 'summary_large_image' },
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

  // Material Symbols reste chargée depuis Google (pas de `next/font` pour une
  // police à ligatures d'icônes), mais réduite au strict nécessaire — cf.
  // scripts/material-symbols.mjs :
  // - un seul poids (`wght@300`, la seule valeur jamais utilisée par le CSS
  //   du site, cf. `.material-symbols-outlined` dans globals.css) au lieu de
  //   la plage variable complète 100..700 ;
  // - `icon_names=` limité aux icônes que le code affiche réellement, au
  //   lieu du catalogue entier (plusieurs centaines de Kio pour une centaine
  //   d'icônes utilisées — audit PageSpeed du 28/09/2026, « Ancien
  //   JavaScript » / poids de la police).
  const materialSymbolsHref = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@300,0..1&icon_names=${process.env.MATERIAL_SYMBOLS_ICON_NAMES}&display=swap`;

  return (
    <html
      lang="fr"
      className={`${playfairDisplay.variable} ${workSans.variable} ${parisienne.variable}`}
    >
      <head>
        <link href={materialSymbolsHref} rel="stylesheet" />
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
        {/* Bandeau de consentement + Google Analytics, chargé seulement après
            « Accepter » (JEP-128, cf. components/CookieConsent.tsx). */}
        <CookieConsent />
        {/* Mémorise le chemin précédent pour le retour contextuel des écrans
            de détail (`RetourContextuel`) — englobe tout le reste : c'est ce
            qui lui permet de survivre à chaque navigation, cf. son en-tête. */}
        <PreviousPathProvider>
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
        </PreviousPathProvider>
      </body>
    </html>
  );
}
