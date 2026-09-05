'use client';

// Fiche de suivi d'une demande de contact, côté membre. Version allégée de
// `components/admin/ContactDetail.tsx` : ni statut modifiable, ni notes
// internes, ni détail Jira, ni contexte technique — uniquement ce qui
// concerne le demandeur (son message, les réponses reçues, l'avancement du
// statut), plus la possibilité d'y ajouter sa propre réponse (lot 9,
// `lib/contact-member-data.ts` `envoyerReponseMembre`) : aucun effet
// automatique sur le statut, contrairement à une réponse admin.
import { useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { PhotoUploader } from '@/components/PhotoUploader';
import { televerserImage } from '@/lib/storage-client';
import { formatDateHeure } from '@/lib/format';
import { CONTACT_STATUSES, CONTACT_TYPES, REPONSE_MEMBRE_MAX, REPONSE_MEMBRE_MIN } from '@/lib/contact';
import type { MaDemandeDetail as MaDemandeDetailRow, MaReponse, MonChangementStatut } from '@/lib/contact-member-data';
import type { ContactMessagePhotoRow } from '@/lib/contact-types';

function Vignettes({ photos }: { photos: { id: string; url: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-outline-variant">
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
          <img src={p.url} alt="" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

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
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const { refresh, busy: refreshBusy } = useMutation();
  const [texte, setTexte] = useState('');
  const [replyPhotos, setReplyPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const valide = texte.trim().length >= REPONSE_MEMBRE_MIN && texte.trim().length <= REPONSE_MEMBRE_MAX;

  async function envoyer() {
    if (!valide) return;
    if (!writeGuard('Répondre à une demande de contact')) return;
    setEnvoiEnCours(true);
    // Déposées avant l'appel à la route (§ 7.5, lot B2 étape 4) — session
    // membre déjà authentifiée, pas de jeton de formulaire à transmettre ici
    // (réservé au dépôt initial, anonyme, de `ContactForm`).
    let photosDeposees: string[];
    try {
      photosDeposees = await Promise.all(replyPhotos.map((p) => televerserImage('contact', p)));
    } catch (e) {
      setEnvoiEnCours(false);
      dialog.alert('Erreur lors du dépôt de la photo : ' + (e as Error).message);
      return;
    }
    const res = await fetch(`/api/reglages/mes-demandes/${message.reference}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: texte, photos: photosDeposees }),
    });
    const resBody = await res.json().catch(() => ({}));
    setEnvoiEnCours(false);
    if (!res.ok) {
      dialog.alert(`Message non envoyé : ${resBody.erreur ?? 'erreur inconnue'}`);
      return;
    }
    setTexte('');
    setReplyPhotos([]);
    refresh();
  }

  const echanges = [
    { kind: 'initial' as const, id: 'initial', created_at: message.created_at, body: message.message },
    ...replies.map((r) => ({ kind: 'reponse' as const, ...r })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="flex flex-col gap-6 pb-16">
      <LoadingOverlay visible={envoiEnCours || refreshBusy} label="Envoi en cours…" />

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
            <Vignettes photos={photos} />
          </div>
        )}
      </div>

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
              {e.kind === 'reponse' && <Vignettes photos={e.photos} />}
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-outline-variant pt-6">
          <label htmlFor="reponse-membre" className="mb-2 block font-label-md text-label-md text-on-surface-variant">
            Ajouter un message à cette demande
          </label>
          <textarea
            id="reponse-membre"
            value={texte}
            onChange={(e) => setTexte(e.target.value.slice(0, REPONSE_MEMBRE_MAX))}
            rows={4}
            className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-[13.5px] focus:border-primary focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between text-[12px] text-outline">
            <span>Au moins {REPONSE_MEMBRE_MIN} caractères.</span>
            <span>
              {texte.length}/{REPONSE_MEMBRE_MAX}
            </span>
          </div>

          <div className="mt-4">
            <PhotoUploader photos={replyPhotos} onChange={setReplyPhotos} onBusyChange={setPhotoBusy} />
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={envoyer}
              disabled={!valide || photoBusy}
              className="rounded-full bg-primary px-6 py-2 text-[13px] font-semibold text-on-primary hover:opacity-90 disabled:opacity-40 transition-all"
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>

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
