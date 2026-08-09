'use client';

// Habillage cliquable + traçage d'un encart partenaire (cf. PartnerSlot).
//
// Composant client minimal, séparé de PartnerSlot (Server Component) : seul
// ce qui a besoin du navigateur (montage, clic) est ici. `inner` reste rendu
// côté serveur et passé en enfant.
//
// L'écriture ne passe pas par useMutation (réservé aux mutations
// authentifiées avec confirmation/alerte) : un affichage doit pouvoir être
// enregistré par un visiteur anonyme, sans session, et sans jamais bloquer la
// navigation ni afficher d'erreur si l'insertion échoue (un compteur de
// statistiques n'est pas une opération dont l'utilisateur doit être informé).
import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type AdEventType = 'impression' | 'click';

type AdEventsTable = {
  insert: (values: { ad_id: number; event_type: AdEventType }) => PromiseLike<{ error: { message: string } | null }>;
};

function recordAdEvent(adId: number, eventType: AdEventType) {
  const table = createClient().from('ad_events' as never) as unknown as AdEventsTable;
  // Fire-and-forget : jamais d'alerte utilisateur pour un compteur de
  // statistiques. L'erreur part quand même en console — sans ça, une
  // politique RLS manquante ou une migration incomplète échoue en silence
  // total, sans aucun moyen de la repérer.
  table.insert({ ad_id: adId, event_type: eventType }).then(({ error }) => {
    if (error) console.error(`Suivi publicité (${eventType}) :`, error.message);
  });
}

export function PartnerLink({
  adId,
  href,
  className,
  children,
}: {
  adId: number;
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  // Un seul affichage compté par montage réel, même si l'effet est rejoué en
  // développement (StrictMode).
  const impressionSent = useRef(false);
  useEffect(() => {
    if (impressionSent.current) return;
    impressionSent.current = true;
    recordAdEvent(adId, 'impression');
  }, [adId]);

  if (!href) return <div className={className}>{children}</div>;

  return (
    // `sponsored` : lien commercial, à ne pas transmettre en réputation.
    // Le clic déclenche l'enregistrement sans intercepter la navigation :
    // le lien s'ouvre dans un nouvel onglet, l'insertion part dans l'onglet
    // d'origine en parallèle.
    <a href={href} target="_blank" rel="sponsored noopener noreferrer" className={className} onClick={() => recordAdEvent(adId, 'click')}>
      {children}
    </a>
  );
}
