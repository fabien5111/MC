'use client';

// Liste des demandes de contact (Admin → Contact, spec §11.2).
//
// Le tri et la recherche sont instantanés dans la fenêtre de 200 lignes déjà
// servie par le serveur ; les filtres statut/type, eux, sont des cases à
// cocher qui réécrivent l'URL (`router.replace`) — c'est le serveur qui les
// applique, ce qui seul permet d'atteindre des demandes plus anciennes que
// la fenêtre (cf. docs/contact-jira.md §2.6). Toute case décochée réduit
// l'ensemble affiché ; tout décocher une colonne entière renvoie une liste
// vide, pas un retour au filtre par défaut. Toute action de mutation
// (changer le statut, répondre, supprimer…) vit dans la vue détail : cette
// liste ne fait que montrer et laisser filtrer/chercher.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_KEYS,
  CONTACT_TYPES,
  CONTACT_TYPE_KEYS,
  SUJET_LISTE_MAX,
  type ContactStatus,
  type ContactType,
} from '@/lib/contact';
import { formatDateHeure } from '@/lib/format';
import type { ContactAnomalyCounts, ContactListRow } from '@/lib/contact-admin-data';

function tronquer(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function estEnAnomalie(r: ContactListRow): boolean {
  return r.jira_sync_status === 'failed' || !!r.admin_notify_error || r.deploy_email_status === 'failed' || r.hasFailedReply;
}

// Groupe de cases à cocher générique (statuts ou types) + « Tout cocher » /
// « Tout décocher ». `T` est `ContactStatus` ou `ContactType` selon l'appel.
function GroupeCoche<T extends string>({
  toutes,
  cochees,
  libelle,
  onChange,
}: {
  toutes: readonly T[];
  cochees: T[];
  libelle: (v: T) => string;
  onChange: (next: T[]) => void;
}) {
  const set = new Set(cochees);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {toutes.map((v) => (
        <label key={v} className="flex items-center gap-1.5 text-[13px] text-on-surface">
          <input
            type="checkbox"
            checked={set.has(v)}
            onChange={(e) => onChange(e.target.checked ? [...cochees, v] : cochees.filter((c) => c !== v))}
            className="accent-primary"
          />
          {libelle(v)}
        </label>
      ))}
      <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden="true" />
      <button type="button" onClick={() => onChange([...toutes])} className="text-[12.5px] font-semibold text-primary hover:underline">
        Tout cocher
      </button>
      <button type="button" onClick={() => onChange([])} className="text-[12.5px] font-semibold text-on-surface-variant hover:underline">
        Tout décocher
      </button>
    </div>
  );
}

function Copiable({ valeur, affichage }: { valeur: string; affichage: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      title="Copier"
      onClick={async () => {
        await navigator.clipboard.writeText(valeur).catch(() => {});
        setCopie(true);
        setTimeout(() => setCopie(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[12.5px] text-on-surface-variant hover:text-primary transition-colors"
    >
      {copie ? 'Copié' : affichage}
      <span className="material-symbols-outlined text-[13px]">{copie ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function BandeauAnomalies({ anomalies }: { anomalies: ContactAnomalyCounts }) {
  const items: string[] = [];
  if (anomalies.jiraFailed > 0) items.push(`${anomalies.jiraFailed} création${anomalies.jiraFailed > 1 ? 's' : ''} de ticket Jira en échec`);
  if (anomalies.notifyFailed > 0) items.push(`${anomalies.notifyFailed} notification${anomalies.notifyFailed > 1 ? 's' : ''} administrateur non envoyée${anomalies.notifyFailed > 1 ? 's' : ''}`);
  if (anomalies.emailFailed > 0) items.push(`${anomalies.emailFailed} e-mail${anomalies.emailFailed > 1 ? 's' : ''} de déploiement en échec`);
  if (anomalies.replyFailed > 0) items.push(`${anomalies.replyFailed} réponse${anomalies.replyFailed > 1 ? 's' : ''} non délivrée${anomalies.replyFailed > 1 ? 's' : ''}`);
  if (items.length === 0) return null;

  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-error/40 bg-error-container px-4 py-3 text-on-error-container">
      <span className="material-symbols-outlined text-[20px]">warning</span>
      <p className="text-[13.5px] leading-relaxed">{items.join(' · ')}.</p>
    </div>
  );
}

export function ContactManager({
  rows,
  anomalies,
  currentStatuses,
  currentTypes,
}: {
  rows: ContactListRow[];
  anomalies: ContactAnomalyCounts;
  currentStatuses: ContactStatus[];
  currentTypes: ContactType[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [anomaliesUniquement, setAnomaliesUniquement] = useState(false);

  const filtrees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (anomaliesUniquement && !estEnAnomalie(r)) return false;
      if (!q) return true;
      return (
        r.reference.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        (r.user_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, anomaliesUniquement]);

  // Toujours écrit explicitement les DEUX paramètres, y compris quand
  // l'ensemble coché correspond à « tout » — plus simple et plus robuste que
  // de tenter de retomber sur l'absence de paramètre, et sans conséquence :
  // `parseStatutsSelectionnes`/`parseTypesSelectionnes` traitent la liste
  // complète exactement comme l'absence.
  function naviguer(statuses: ContactStatus[], types: ContactType[]) {
    const params = new URLSearchParams();
    params.set('statuts', statuses.join(','));
    params.set('types', types.join(','));
    router.replace(`/admin/contact?${params.toString()}`, { scroll: false });
  }

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <BandeauAnomalies anomalies={anomalies} />

      <GroupeCoche
        toutes={CONTACT_STATUS_KEYS}
        cochees={currentStatuses}
        libelle={(s) => CONTACT_STATUSES[s].label}
        onChange={(next) => naviguer(next, currentTypes)}
      />
      <GroupeCoche
        toutes={CONTACT_TYPE_KEYS}
        cochees={currentTypes}
        libelle={(t) => CONTACT_TYPES[t].labelCourt}
        onChange={(next) => naviguer(currentStatuses, next)}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Référence, e-mail, sujet, identifiant…"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-[13.5px] focus:border-primary focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
          <input type="checkbox" checked={anomaliesUniquement} onChange={(e) => setAnomaliesUniquement(e.target.checked)} className="accent-primary" />
          Anomalies uniquement
        </label>
        <span className="ml-auto text-[12.5px] text-on-surface-variant">
          {filtrees.length} demande{filtrees.length > 1 ? 's' : ''}
          {rows.length >= 200 ? ' (fenêtre des 200 plus récentes — affinez le filtre pour remonter plus loin)' : ''}
        </span>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left">
          <thead className="border-b border-outline-variant bg-surface-container font-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Référence</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Membre</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Sujet</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Statut</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Échanges</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">Jira</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant font-body-md text-[13.5px] text-on-surface">
            {filtrees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">
                  Aucune demande ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              filtrees.map((r) => {
                const enAnomalie = estEnAnomalie(r);
                return (
                  <tr key={r.id} className="align-top hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/contact/${r.reference}`} className="font-label-md text-primary hover:underline">
                        {r.reference}
                      </Link>
                      {enAnomalie && (
                        <span className="material-symbols-outlined ml-1.5 align-middle text-[15px] text-error" title="Anomalie sur cette demande">
                          warning
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-on-surface-variant">{formatDateHeure(r.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${CONTACT_TYPES[r.type].badgeClass}`}>
                        {CONTACT_TYPES[r.type].labelCourt}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>{r.authorName || (r.user_id ? 'Membre' : 'Visiteur')}</div>
                      {r.email && <Copiable valeur={r.email} affichage={r.email} />}
                      {r.user_id && (
                        <div className="mt-0.5">
                          <Copiable valeur={r.user_id} affichage={`${r.user_id.slice(0, 8)}…`} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">{tronquer(r.subject, SUJET_LISTE_MAX)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${CONTACT_STATUSES[r.status].badgeClass}`}>
                        {CONTACT_STATUSES[r.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">{r.replyCount || '—'}</td>
                    <td className="px-4 py-3.5">
                      {r.jira_issue_key ? (
                        <span className="text-on-surface-variant">
                          {r.jira_issue_key}
                          {r.jira_status ? <span className="block text-[11px]">{r.jira_status}</span> : null}
                        </span>
                      ) : r.jira_sync_status === 'pending' ? (
                        <span className="text-on-surface-variant">En cours…</span>
                      ) : r.jira_sync_status === 'failed' ? (
                        <span className="text-error">Échec</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
