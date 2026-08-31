// Fiche de suivi d'une demande de contact, côté membre — LECTURE SEULE.
// Version allégée de `components/admin/ContactDetail.tsx` : ni statut
// modifiable, ni notes internes, ni détail Jira, ni contexte technique —
// uniquement ce qui concerne le demandeur (son message, les réponses
// reçues, l'avancement du statut).
import { formatDateHeure } from '@/lib/format';
import { CONTACT_STATUSES, CONTACT_TYPES } from '@/lib/contact';
import type { MaDemandeDetail as MaDemandeDetailRow, MaReponse, MonChangementStatut } from '@/lib/contact-member-data';
import type { ContactMessagePhotoRow } from '@/lib/contact-types';

export function MaDemandeDetail({
  message,
  replies,
  history,
  photos,
}: {
  message: MaDemandeDetailRow;
  replies: MaReponse[];
  history: MonChangementStatut[];
  photos: ContactMessagePhotoRow[];
}) {
  const echanges = [
    { kind: 'initial' as const, id: 'initial', created_at: message.created_at, body: message.message },
    ...replies.map((r) => ({ kind: 'reponse' as const, ...r })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="flex flex-col gap-6 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${CONTACT_TYPES[message.type].badgeClass}`}>
          {CONTACT_TYPES[message.type].label}
        </span>
        <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${CONTACT_STATUSES[message.status].badgeClass}`}>
          {CONTACT_STATUSES[message.status].label}
        </span>
        <span className="text-[12.5px] text-on-surface-variant">Envoyée le {formatDateHeure(message.created_at)}</span>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h1 className="font-headline-md text-lg text-primary mb-3">{message.subject}</h1>
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-on-surface">{message.message}</p>

        {photos.length > 0 && (
          <div className="mt-4 border-t border-outline-variant pt-4">
            <p className="mb-2 text-[11.5px] uppercase tracking-wide text-on-surface-variant">
              Photo{photos.length > 1 ? 's' : ''} jointe{photos.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-3">
              {photos.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-24 w-24 overflow-hidden rounded-lg border border-outline-variant"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="font-headline-md text-base font-semibold mb-4">Échanges</h2>
          <ul className="flex flex-col gap-4">
            {echanges.map((e) => (
              <li
                key={e.id}
                className={e.kind === 'initial' ? 'rounded-lg bg-surface-container-low p-4' : 'rounded-lg border border-outline-variant p-4'}
              >
                <p className="text-[11.5px] text-on-surface-variant mb-1">
                  {e.kind === 'initial' ? 'Votre demande' : 'Réponse'} — {formatDateHeure(e.created_at)}
                </p>
                <p className="whitespace-pre-wrap text-[13.5px]">{e.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="font-headline-md text-base font-semibold mb-4">Avancement</h2>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 border-b border-outline-variant/50 py-2 text-[13px] last:border-0">
                <span className="text-on-surface-variant">{formatDateHeure(h.changed_at)}</span>
                <span>
                  {h.from_status ? CONTACT_STATUSES[h.from_status].label : 'Envoyée'} → {CONTACT_STATUSES[h.to_status].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
