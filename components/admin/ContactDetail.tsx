'use client';

// Fiche détail d'une demande de contact (`/admin/contact/[reference]`,
// spec §11.3). Réservé à l'admin complet.
//
// **Toutes les écritures passent par les routes `/api/admin/contact/*`**,
// jamais par un client Supabase direct depuis le navigateur : contrairement
// à `comments` (RLS ouverte à `is_admin_user()` en écriture, motif de
// `CommentsManager`), `contact_messages` et ses tables satellites n'ont
// AUCUNE policy d'écriture, pour personne (spec §12, lot 1 §6.2) — même un
// admin authentifié ne peut écrire qu'avec la clé service_role, côté
// serveur. D'où l'absence de `useMutation().mutate()` ici : ce hook attend
// une promesse Supabase, pas un appel `fetch`. On garde seulement
// `refresh()`, pour resynchroniser le rendu serveur après un succès — même
// motif que les fenêtres modales (CLAUDE.md « une fenêtre modale ne porte
// jamais sa propre resynchronisation »).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDateHeure } from '@/lib/format';
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_KEYS,
  CONTACT_TYPES,
  REPONSE_ADMIN_MAX,
  REPONSE_ADMIN_MIN,
  type ContactStatus,
} from '@/lib/contact';
import type { ContactDetail as ContactDetailRow } from '@/lib/contact-admin-data';
import type { ContactMessagePhotoRow, ContactReplyRow, ContactStatusHistoryRow } from '@/lib/contact-types';

function Copiable({ valeur, affichage }: { valeur: string; affichage: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(valeur).catch(() => {});
        setCopie(true);
        setTimeout(() => setCopie(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
    >
      {copie ? 'Copié' : affichage}
      <span className="material-symbols-outlined text-[13px]">{copie ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function CollapsibleSection({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-outline-variant rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 bg-surface-container-low hover:bg-surface-container-high transition-colors text-left"
      >
        <span className="font-headline-md text-base font-semibold">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <span className="material-symbols-outlined text-on-surface-variant">{open ? 'expand_less' : 'expand_more'}</span>
        </div>
      </button>
      {open && <div className="px-6 py-6 space-y-4 text-[13.5px]">{children}</div>}
    </div>
  );
}

const EMAIL_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'text-on-surface-variant' },
  sent: { label: 'Envoyé', className: 'text-primary' },
  failed: { label: 'Échec', className: 'text-error' },
  skipped: { label: 'Non envoyé', className: 'text-on-surface-variant' },
};

async function appelAdmin(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export function ContactDetail({
  message,
  replies,
  history,
  photos,
  jiraUrl,
}: {
  message: ContactDetailRow;
  replies: ContactReplyRow[];
  history: ContactStatusHistoryRow[];
  photos: ContactMessagePhotoRow[];
  jiraUrl: string | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { refresh, busy: refreshBusy } = useMutation();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // ── Statut manuel ──────────────────────────────────────────────────────
  const [status, setStatus] = useState<ContactStatus>(message.status);
  async function changerStatut(next: ContactStatus) {
    const avant = status;
    setStatus(next);
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    setEnvoiEnCours(false);
    if (!ok) {
      setStatus(avant);
      dialog.alert(`Statut non enregistré : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    refresh();
  }

  // ── Notes internes, sauvegarde automatique ─────────────────────────────
  const [notes, setNotes] = useState(message.admin_notes ?? '');
  const notesInitiales = useRef(message.admin_notes ?? '');
  useEffect(() => {
    if (notes === notesInitiales.current) return;
    const t = setTimeout(async () => {
      notesInitiales.current = notes;
      await appelAdmin(`/api/admin/contact/${message.id}`, { method: 'PATCH', body: JSON.stringify({ adminNotes: notes }) });
      // Pas de `refresh()` : rien d'autre sur cet écran ne lit `admin_notes`,
      // resynchroniser resterait sans effet visible pour un coût de rendu
      // inutile à chaque frappe.
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // ── Interrupteur de l'e-mail de déploiement ────────────────────────────
  const [deployNotify, setDeployNotify] = useState(message.deploy_notify);
  async function basculerDeployNotify(v: boolean) {
    setDeployNotify(v);
    await appelAdmin(`/api/admin/contact/${message.id}`, { method: 'PATCH', body: JSON.stringify({ deployNotify: v }) });
  }

  // ── Reprise de la création Jira ─────────────────────────────────────────
  async function relancerJira() {
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}/jira`, { method: 'POST' });
    setEnvoiEnCours(false);
    if (!ok) {
      dialog.alert(`Création du ticket toujours en échec : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    refresh();
  }

  async function resynchroniserJira() {
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}/jira/resync`, { method: 'POST' });
    setEnvoiEnCours(false);
    if (!ok) {
      dialog.alert(`Resynchronisation impossible : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    refresh();
  }

  // ── Réponse au demandeur ────────────────────────────────────────────────
  const [reponse, setReponse] = useState('');
  const [apercu, setApercu] = useState(false);
  const reponseValide = reponse.trim().length >= REPONSE_ADMIN_MIN && reponse.trim().length <= REPONSE_ADMIN_MAX;

  async function envoyerReponse() {
    if (!reponseValide) return;
    if (!(await dialog.confirm('Envoyer cette réponse au demandeur ?'))) return;
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body: reponse }),
    });
    setEnvoiEnCours(false);
    if (!ok) {
      dialog.alert(`Réponse non enregistrée : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    setReponse('');
    setApercu(false);
    if (body.delivered === false) {
      dialog.alert("La réponse est enregistrée, mais l'e-mail n'a pas pu être envoyé. Utilisez « Renvoyer » depuis le fil des échanges.");
    }
    refresh();
  }

  async function renvoyer(replyId: string) {
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}/reply/${replyId}`, { method: 'POST' });
    setEnvoiEnCours(false);
    if (!ok) {
      dialog.alert(`Renvoi impossible : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    refresh();
  }

  // ── Suppression ──────────────────────────────────────────────────────────
  async function supprimer() {
    if (!(await dialog.confirm(`Supprimer définitivement la demande ${message.reference} ? Ses réponses et son historique disparaissent avec elle.`))) return;
    setEnvoiEnCours(true);
    const { ok, body } = await appelAdmin(`/api/admin/contact/${message.id}`, { method: 'DELETE' });
    setEnvoiEnCours(false);
    if (!ok) {
      dialog.alert(`Suppression impossible : ${body.erreur ?? 'erreur inconnue'}`);
      return;
    }
    router.push('/admin/contact');
  }

  const echanges = [
    { kind: 'initial' as const, created_at: message.created_at },
    ...replies.map((r) => ({ kind: 'reply' as const, ...r })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <LoadingOverlay visible={envoiEnCours || refreshBusy} label="Traitement en cours…" />

      <div className="mx-auto flex max-w-[880px] flex-col gap-6">
        {/* En-tête : type, statut, sélecteur */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${CONTACT_TYPES[message.type].badgeClass}`}>
            {CONTACT_TYPES[message.type].label}
          </span>
          <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
            Statut :
            <select
              value={status}
              onChange={(e) => changerStatut(e.target.value as ContactStatus)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-[13px] focus:border-primary focus:outline-none"
            >
              {CONTACT_STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUSES[s].label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[12.5px] text-on-surface-variant">Reçue le {formatDateHeure(message.created_at)}</span>
        </div>

        {/* Message */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h1 className="font-headline-md text-lg text-primary mb-3">{message.subject}</h1>
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-on-surface">{message.message}</p>

          {photos.length > 0 && (
            <div className="mt-4 border-t border-outline-variant pt-4">
              <p className="mb-2 text-[11.5px] uppercase tracking-wide text-on-surface-variant">
                Photo{photos.length > 1 ? 's' : ''} jointe{photos.length > 1 ? 's' : ''} — jamais transmise
                {photos.length > 1 ? 's' : ''} à Jira
              </p>
              <div className="flex flex-wrap gap-3">
                {photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-outline-variant">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bloc identité */}
        <CollapsibleSection title="Identité">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Nom</dt>
              <dd>{message.authorName || (message.user_id ? 'Membre' : 'Visiteur non connecté')}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">E-mail</dt>
              <dd>{message.email ? <Copiable valeur={message.email} affichage={message.email} /> : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Identifiant membre</dt>
              <dd>{message.user_id ? <Copiable valeur={message.user_id} affichage={`${message.user_id.slice(0, 8)}…`} /> : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Inscrit depuis</dt>
              <dd>{message.authorRegisteredAt ? formatDateHeure(message.authorRegisteredAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Demandes précédentes</dt>
              <dd>{message.previousRequestsCount}</dd>
            </div>
          </dl>
        </CollapsibleSection>

        {/* Bloc technique */}
        <CollapsibleSection title="Contexte technique">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Page</dt>
              <dd className="break-all">{message.page_url || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Navigateur</dt>
              <dd>{message.browser_context || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wide text-on-surface-variant">Version</dt>
              <dd>{message.app_version || '—'}</dd>
            </div>
          </dl>
        </CollapsibleSection>

        {/* Bloc Jira */}
        {message.type === 'bug' && (
          <CollapsibleSection
            title="Jira"
            defaultOpen={message.jira_sync_status === 'failed'}
            badge={
              message.jira_sync_status === 'failed' ? (
                <span className="rounded-full bg-error-container px-2.5 py-0.5 text-[11px] font-semibold text-on-error-container">Échec</span>
              ) : undefined
            }
          >
            {message.jira_issue_key ? (
              <>
                <p>
                  Ticket :{' '}
                  {jiraUrl ? (
                    <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {message.jira_issue_key}
                    </a>
                  ) : (
                    message.jira_issue_key
                  )}
                </p>
                {message.jira_status && <p>Statut Jira : {message.jira_status}</p>}
                {message.jira_synced_at && <p>Dernière synchronisation : {formatDateHeure(message.jira_synced_at)}</p>}
                <button
                  type="button"
                  onClick={resynchroniserJira}
                  className="rounded-full border border-outline-variant px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:text-primary hover:border-primary transition-colors"
                >
                  Resynchroniser maintenant
                </button>
              </>
            ) : (
              <>
                <p className="text-error">
                  Création échouée{message.jira_error ? ` : ${message.jira_error}` : ''}.
                </p>
                <button
                  type="button"
                  onClick={relancerJira}
                  className="rounded-full border border-primary px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary hover:text-on-primary transition-colors"
                >
                  Créer le ticket
                </button>
              </>
            )}
          </CollapsibleSection>
        )}

        {/* Fil des échanges */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="font-headline-md text-base font-semibold mb-4">Échanges</h2>
          <ul className="flex flex-col gap-4">
            {echanges.map((e) =>
              e.kind === 'initial' ? (
                <li key="initial" className="rounded-lg bg-surface-container-low p-4">
                  <p className="text-[11.5px] text-on-surface-variant mb-1">Demande initiale — {formatDateHeure(e.created_at)}</p>
                  <p className="whitespace-pre-wrap text-[13.5px]">{message.message}</p>
                </li>
              ) : (
                <li key={e.id} className="rounded-lg border border-outline-variant p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[11.5px] text-on-surface-variant">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                          e.author_kind === 'member' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-secondary-container text-on-secondary-container'
                        }`}
                      >
                        {e.author_kind === 'member' ? 'Demandeur' : 'Administration'}
                      </span>
                      {formatDateHeure(e.created_at)}
                    </p>
                    {e.author_kind === 'admin' && (
                      <span className={`text-[11.5px] font-semibold ${EMAIL_STATUS_LABEL[e.email_status]?.className ?? ''}`}>
                        {EMAIL_STATUS_LABEL[e.email_status]?.label ?? e.email_status}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-[13.5px]">{e.body}</p>
                  {e.author_kind === 'admin' && e.email_status === 'failed' && (
                    <button type="button" onClick={() => renvoyer(e.id)} className="mt-2 text-[12.5px] font-semibold text-primary hover:underline">
                      Renvoyer
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>

          {/* Zone de réponse */}
          <div className="mt-6 border-t border-outline-variant pt-6">
            {!message.email ? (
              <p className="text-[13px] text-on-surface-variant">
                Aucune adresse e-mail associée à cette demande : impossible de répondre directement.
              </p>
            ) : (
              <>
                <label htmlFor="reponse-admin" className="mb-2 block font-label-md text-label-md text-on-surface-variant">
                  Répondre à {message.email}
                </label>
                <textarea
                  id="reponse-admin"
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value.slice(0, REPONSE_ADMIN_MAX))}
                  rows={5}
                  className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-[13.5px] focus:border-primary focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between text-[12px] text-outline">
                  <span>Au moins {REPONSE_ADMIN_MIN} caractères.</span>
                  <span>
                    {reponse.length}/{REPONSE_ADMIN_MAX}
                  </span>
                </div>

                {apercu && reponse.trim() && (
                  <div className="mt-3 rounded-lg bg-surface-container-low p-4">
                    <p className="mb-2 text-[11.5px] uppercase tracking-wide text-on-surface-variant">Aperçu</p>
                    <p className="whitespace-pre-wrap text-[13.5px]">{reponse}</p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setApercu((v) => !v)}
                    disabled={!reponse.trim()}
                    className="rounded-full border border-outline-variant px-4 py-2 text-[13px] text-on-surface-variant hover:text-primary disabled:opacity-40 transition-colors"
                  >
                    {apercu ? "Masquer l'aperçu" : 'Aperçu'}
                  </button>
                  <button
                    type="button"
                    onClick={envoyerReponse}
                    disabled={!reponseValide}
                    className="rounded-full bg-primary px-6 py-2 text-[13px] font-semibold text-on-primary hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    Envoyer la réponse
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bloc e-mail de déploiement — uniquement pour un signalement de bug */}
        {message.type === 'bug' && (
          <CollapsibleSection title="E-mail de déploiement">
            <p>
              Statut :{' '}
              <span className={EMAIL_STATUS_LABEL[message.deploy_email_status]?.className}>
                {EMAIL_STATUS_LABEL[message.deploy_email_status]?.label ?? message.deploy_email_status}
              </span>
            </p>
            {message.deploy_email_sent_at && <p>Envoyé le {formatDateHeure(message.deploy_email_sent_at)}</p>}
            {message.deploy_email_error && <p className="text-error">{message.deploy_email_error}</p>}
            <label className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={deployNotify} onChange={(e) => basculerDeployNotify(e.target.checked)} className="accent-primary" />
              Prévenir le demandeur quand la correction est déployée
            </label>
            <p className="text-[12px] text-on-surface-variant">
              L&apos;envoi est immédiat au passage du ticket Jira en statut « déployé ». Désactivez cet interrupteur
              AVANT ce passage si vous ne voulez pas que le demandeur soit prévenu — une fois l&apos;e-mail parti, il
              n&apos;y a pas de retour en arrière.
            </p>
          </CollapsibleSection>
        )}

        {/* Notes internes */}
        <CollapsibleSection title="Notes internes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Visibles uniquement par l'équipe, enregistrées automatiquement."
            className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-[13.5px] focus:border-primary focus:outline-none"
          />
        </CollapsibleSection>

        {/* Historique des statuts */}
        <CollapsibleSection title="Historique des statuts" badge={<span className="text-[12px] text-on-surface-variant">{history.length}</span>}>
          {history.length === 0 ? (
            <p className="text-on-surface-variant">Aucun changement de statut enregistré pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 border-b border-outline-variant/50 py-2 last:border-0">
                  <span className="text-on-surface-variant">{formatDateHeure(h.changed_at)}</span>
                  <span>
                    {h.from_status ? CONTACT_STATUSES[h.from_status].label : '—'} → {CONTACT_STATUSES[h.to_status].label}
                  </span>
                  <span className="text-[11.5px] text-on-surface-variant">
                    ({h.source === 'admin' ? 'administrateur' : h.source === 'jira-webhook' ? 'webhook Jira' : 'réconciliation Jira'}
                    {h.jira_status ? ` — ${h.jira_status}` : ''})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* Suppression */}
        <div className="flex justify-end pt-4">
          <button type="button" onClick={supprimer} className="text-[13px] font-semibold text-error hover:underline">
            Supprimer cette demande
          </button>
        </div>

        <Link href="/admin/contact" className="text-[13px] text-on-surface-variant hover:text-primary transition-colors">
          ← Retour à la liste
        </Link>
      </div>
    </main>
  );
}
