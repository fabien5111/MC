// « Mes demandes de contact » des réglages — suivi de ses propres demandes
// envoyées depuis `/contact`, en lecture seule (aucune écriture ici : c'est
// l'écran d'administration qui répond et fait avancer le statut). Pas de
// `'use client'` propre à ce composant : la seule interactivité (replier/
// déplier) vit déjà dans `SettingsCard`, le reste n'est que des liens.
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { CONTACT_STATUSES, CONTACT_TYPES } from '@/lib/contact';
import type { MaDemandeListe } from '@/lib/contact-member-data';
import { SettingsCard } from '@/components/profile/SettingsCard';

export function MesDemandesCard({ demandes }: { demandes: MaDemandeListe[] }) {
  return (
    <SettingsCard icon="mark_email_read" title="Mes demandes de contact" count={demandes.length}>
      {demandes.length === 0 ? (
        <p className="font-body-md text-sm text-on-surface-variant italic">Aucune demande envoyée depuis ce compte.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40">
          {demandes.map((d) => (
            <li key={d.reference}>
              <Link
                href={`/reglages/mes-demandes/${d.reference}`}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-container-low/60"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-body-md text-sm text-on-surface truncate">{d.subject}</span>
                  <span className="font-body-md text-[12px] text-on-surface-variant">
                    {CONTACT_TYPES[d.type].labelCourt} · {formatDate(d.created_at)}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold ${CONTACT_STATUSES[d.status].badgeClass}`}>
                  {CONTACT_STATUSES[d.status].label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
