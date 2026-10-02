'use client';

// Bandeau de consentement + chargement de Google Analytics 4 (JEP-128).
//
// Règle unique : **aucun script Google n'est chargé tant que le visiteur n'a
// pas cliqué « Accepter »** — pas de Consent Mode « denied » qui chargerait
// gtag.js quand même : un appel réseau vers Google avant le choix est déjà ce
// que la CNIL sanctionne. Sans `NEXT_PUBLIC_GA_ID`, rien ne s'affiche : sans
// traceur soumis à consentement, un bandeau n'aurait rien à demander.
//
// « Accepter » et « Refuser » ont le même poids visuel, au même niveau : un
// refus plus difficile qu'une acceptation invalide le consentement (CNIL).
// Le bandeau se rouvre depuis le pied de page ou le § 10 de /confidentialite
// (`ouvrirGestionCookies`) — retirer son consentement doit être aussi simple
// que l'avoir donné.
//
// Le site des testeurs (`GA_HOTE_INTERNE`) marque ses visites `traffic_type:
// 'internal'` : le filtre de données « Trafic interne » de GA4 les exclut des
// rapports (JEP-89).
//
// Les pages vues des navigations internes sont comptées par GA lui-même
// (mesure améliorée, « changements d'historique ») : rien à émettre ici.
import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import {
  EVENEMENT_CHOIX,
  EVENEMENT_OUVRIR,
  GA_COOKIE_EXPIRES_S,
  GA_HOTE_INTERNE,
  GA_ID,
  enregistrerConsentement,
  lireConsentement,
  ouvrirGestionCookies,
  type Choix,
} from '@/lib/consent';

export function CookieConsent() {
  // `undefined` : pas encore lu (premier rendu, serveur compris) — rien
  // d'affiché, sans quoi le bandeau clignoterait chez qui a déjà choisi.
  const [choix, setChoix] = useState<Choix | null | undefined>(undefined);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!GA_ID) return;
    const initial = lireConsentement();
    setChoix(initial);
    setOuvert(initial === null);
    const surOuverture = () => setOuvert(true);
    const surChoix = (e: Event) => setChoix((e as CustomEvent<Choix>).detail);
    window.addEventListener(EVENEMENT_OUVRIR, surOuverture);
    window.addEventListener(EVENEMENT_CHOIX, surChoix);
    return () => {
      window.removeEventListener(EVENEMENT_OUVRIR, surOuverture);
      window.removeEventListener(EVENEMENT_CHOIX, surChoix);
    };
  }, []);

  if (!GA_ID) return null;

  function choisir(c: Choix) {
    enregistrerConsentement(c);
    setOuvert(false);
  }

  return (
    <>
      {choix === 'accepte' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window['ga-disable-${GA_ID}']=false;window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());var c={cookie_expires:${GA_COOKIE_EXPIRES_S},allow_google_signals:false,allow_ad_personalization_signals:false};if(location.hostname==='${GA_HOTE_INTERNE}'){c.traffic_type='internal';}gtag('config','${GA_ID}',c);`}
          </Script>
        </>
      )}
      {ouvert && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Gestion des cookies"
          className="cookie-consent-banner rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xl"
        >
          <p className="font-label-md text-sm font-semibold text-on-surface">Mesure d&apos;audience</p>
          <p className="mt-1 font-body-md text-xs leading-relaxed text-on-surface-variant">
            Avec votre accord, nous utilisons Google Analytics pour mesurer la fréquentation du site et
            l&apos;améliorer. Aucun cookie publicitaire. Vous pouvez changer d&apos;avis à tout moment depuis le bas
            de page.{' '}
            <Link href="/confidentialite#cookies" className="text-primary underline underline-offset-2">
              En savoir plus
            </Link>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => choisir('refuse')}
              className="rounded-full border border-primary px-4 py-2 font-label-md text-sm font-semibold text-primary"
            >
              Refuser
            </button>
            <button
              type="button"
              onClick={() => choisir('accepte')}
              className="rounded-full border border-primary px-4 py-2 font-label-md text-sm font-semibold text-primary"
            >
              Accepter
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Bouton « Gérer mes cookies » (pied de page, § 10) — absent sans GA. */
export function GererCookiesButton({ className }: { className?: string }) {
  if (!GA_ID) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={ouvrirGestionCookies}
    >
      Gérer mes cookies
    </button>
  );
}
