'use client';

// Fiche membre (`/admin/membres/[id]`) : toutes les infos et toutes les
// actions d'un membre, regroupées en un seul écran — remplace le panneau
// latéral `EditPanel` (+ son sous-panneau abonnement empilé) qui s'ouvrait
// depuis le bouton « Modifier » de la liste. Même pattern que les autres
// fiches détail de l'admin (`/admin/blog/[id]`, `/admin/partenaires/[id]/…`) :
// route dédiée, chargement serveur, actions regroupées.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { Member, LoginHistoryEntry } from '@/lib/admin';
import type { ImpersonationSessionWithEvents } from '@/lib/impersonation';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatUsd } from '@/lib/ai/cost';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { withImpersonationSchema, modeLabel, type ImpersonationMode } from '@/lib/impersonation-types';
import { useImpersonateLink, ImpersonationLinkPanel } from '@/components/admin/ImpersonateButton';
import { MemberSubscriptionPanel } from '@/components/admin/MemberSubscriptionPanel';

const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';
const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

function inviteLinkFor(email: string): string {
  return `${window.location.origin}/connexion?invite=${encodeURIComponent(email)}`;
}

export function MemberDetail({
  member,
  stats,
  impersonationSessions,
}: {
  member: Member;
  stats: { followers: number; following: number; batches: number };
  impersonationSessions: ImpersonationSessionWithEvents[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate, busy: savingBusy } = useMutation();
  const { connect: connectImpersonation, busy: impBusy, link: impersonation, clear: clearImpersonation } = useImpersonateLink();

  const [status, setStatus] = useState(member.status);
  const [role, setRole] = useState(member.role);
  const [isDemo, setIsDemo] = useState(member.is_demo);
  const [notes, setNotes] = useState(member.notes || '');
  const [impAccess, setImpAccess] = useState<ImpersonationMode>(member.impersonationAccess);
  const [deleting, setDeleting] = useState(false);

  const initials = member.fullName
    ? member.fullName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : member.email[0]?.toUpperCase() || '?';

  async function save() {
    await mutate(async () => {
      const supabase = createClient();
      const fields = { status, role, is_demo: isDemo, notes: notes.trim() || null };
      // Les deux lignes sont mises à jour quand elles existent toutes les
      // deux — cf. `EditPanel` d'origine, même doctrine reprise telle quelle :
      // la fiche affiche en priorité le rôle de l'allowlist alors que les
      // droits réels se lisent dans `profiles.role`.
      let error: { message: string } | null = null;
      if (member.allowlistId) {
        ({ error } = await supabase.from('allowlist').update(fields).eq('id', member.allowlistId));
      }
      if (!error && member.profileId) {
        ({ error } = await withImpersonationSchema(supabase)
          .from('profiles')
          .update({ ...fields, impersonation_access: impAccess })
          .eq('id', member.profileId));
      }
      if (!member.allowlistId && !member.profileId) error = { message: 'Membre introuvable' };
      return { error };
    }, { errorLabel: 'Enregistrement impossible' });
  }

  function connecterEnTantQue() {
    if (!member.profileId) {
      dialog.alert("Ce membre n'a pas encore de compte : impossible d'ouvrir une session.");
      return;
    }
    connectImpersonation(member.profileId, member.fullName || member.email);
  }

  async function supprimer() {
    const ok = await dialog.confirm(
      `Supprimer « ${member.fullName || member.email} » ?\n\n` +
        'Le compte de connexion sera également supprimé : le membre ne pourra plus se connecter.',
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/delete-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: member.profileId, allowlistId: member.allowlistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dialog.alert(data?.erreur || 'Suppression impossible');
        setDeleting(false);
        return;
      }
      router.push('/admin/membres');
    } catch (e) {
      dialog.alert('Erreur réseau : ' + ((e as Error).message || 'suppression impossible'));
      setDeleting(false);
    }
  }

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop max-w-[900px] w-full space-y-6">
      <LoadingOverlay visible={impBusy || deleting} />

      {/* En-tête : identité + lien vers la vitrine publique */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex items-center gap-4">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img src={member.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary-fixed-dim flex items-center justify-center text-on-primary-fixed font-headline-md text-2xl font-bold shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-headline-md text-lg font-semibold truncate">
            {member.fullName || <span className="text-on-surface-variant font-normal italic">Pas encore inscrit</span>}
          </p>
          <p className="text-sm text-on-surface-variant truncate">{member.email}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {member.registeredAt ? <>Inscrit le {formatDate(member.registeredAt)}</> : <>Invité le {formatDate(member.invited_at) || '—'}</>}
          </p>
        </div>
        {member.username && (
          <a
            href={`/u/${member.username}`}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto shrink-0 flex items-center gap-1 rounded-pill border border-outline-variant px-4 py-2 text-[12.5px] font-semibold text-primary hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-base">open_in_new</span> Profil public
          </a>
        )}
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(
          [
            ['Recettes', member.profileId ? member.recipeCount : '—'],
            ['Abonnés', member.profileId ? stats.followers : '—'],
            ['Abonnements', member.profileId ? stats.following : '—'],
            ['Fournées', member.profileId ? stats.batches : '—'],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
            <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</p>
            <p className="font-headline-md text-2xl text-primary">{v}</p>
          </div>
        ))}
      </div>

      {member.profileId && (member.coutIaMois != null || member.coutIaTotal != null) && (
        <AiUsageDetail userId={member.profileId} coutMois={member.coutIaMois ?? 0} coutTotal={member.coutIaTotal ?? 0} />
      )}

      {/* Identité / statut */}
      <div className="border border-outline-variant rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
          <h3 className="font-headline-md text-base font-semibold">Identité et statut</h3>
        </div>
        <div className="px-6 py-6 space-y-5">
          <Row label="Statut">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
              <option value="active">Actif</option>
              <option value="pending">Invité</option>
              <option value="disabled">Désactivé</option>
            </select>
          </Row>
          <Row label="Rôle">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
              <option value="member">Membre</option>
              <option value="gestionnaire">Gestionnaire</option>
              <option value="admin">Admin</option>
            </select>
            {role === 'gestionnaire' && (
              <span className="text-[11px] text-on-surface-variant mt-1 block">
                Accès restreint au back-office : modération des recettes et rédaction du blog. Ni membres, ni référentiels,
                ni paramètres du site.
              </span>
            )}
          </Row>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} /> Compte de démonstration
          </label>
          <Row label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={FIELD} />
          </Row>
          {member.status === 'pending' && (
            <div className="flex flex-col gap-2">
              <span className={LABEL}>Lien d&apos;invitation</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLinkFor(member.email)}
                  className="flex-1 border-b border-outline-variant bg-transparent py-1.5 text-xs text-on-surface-variant focus:outline-none"
                  type="text"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inviteLinkFor(member.email)).then(() => dialog.alert('Lien copié dans le presse-papiers.'))}
                  className="text-primary hover:opacity-70 text-sm flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-lg">content_copy</span>
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={save}
            disabled={savingBusy}
            className="bg-primary text-on-primary py-2.5 px-6 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {savingBusy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Impersonation */}
      {member.profileId && (
        <div className="border border-outline-variant rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
            <h3 className="font-headline-md text-base font-semibold">Connexion « en tant que »</h3>
          </div>
          <div className="px-6 py-6 space-y-5">
            {role === 'admin' && (
              <Row label="Droits hérités par les sessions ouvertes par cet administrateur">
                <select value={impAccess} onChange={(e) => setImpAccess(e.target.value as ImpersonationMode)} className={FIELD}>
                  <option value="read_only">Lecture seule</option>
                  <option value="write">Modification</option>
                </select>
                <span className="text-[11px] text-on-surface-variant mt-1 block">
                  N&apos;oubliez pas d&apos;enregistrer après avoir changé ce réglage.
                </span>
              </Row>
            )}
            <button
              type="button"
              onClick={connecterEnTantQue}
              disabled={impBusy}
              className="flex items-center justify-center gap-2 border border-outline-variant rounded py-2.5 px-6 text-sm font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">switch_account</span>
              {impBusy ? 'Génération du lien…' : 'Connecter en tant que'}
            </button>
            <ImpersonationSessionsList sessions={impersonationSessions} />
            <LoginHistory userId={member.profileId} />
          </div>
        </div>
      )}

      {/* Abonnement */}
      {member.profileId && <MemberSubscriptionPanel memberId={member.profileId} />}

      {/* Suppression */}
      <div className="border border-error/40 rounded-xl p-6 space-y-3">
        <h3 className="font-headline-md text-base font-semibold text-error">Zone de danger</h3>
        <button
          type="button"
          onClick={supprimer}
          className="w-full border border-error text-error py-2.5 rounded text-sm font-semibold hover:bg-error/5 transition-colors"
        >
          Supprimer définitivement
        </button>
        <p className="text-[10px] text-on-surface-variant text-center">
          La suppression est irréversible : le compte de connexion est supprimé et les recettes du membre seront orphelinées.
        </p>
      </div>

      {impersonation && <ImpersonationLinkPanel link={impersonation} onClose={clearImpersonation} />}
    </main>
  );
}

// Sessions « connecté en tant que » ouvertes par un admin SUR ce membre —
// même donnée que `ImpersonationAudit` (journal global, bas de la liste),
// filtrée ici à un seul membre (`getImpersonationSessions(limit, userId)`),
// et chargée côté serveur (page.tsx) : contrairement à `LoginHistory`
// ci-dessous, aucune route dédiée n'était nécessaire, la RLS admin suffit
// déjà à `getImpersonationSessions`. Distinct de `LoginHistory` : ici, ce
// sont les connexions faites PAR un admin, pas les connexions du membre
// lui-même.
function ImpersonationSessionsList({ sessions }: { sessions: ImpersonationSessionWithEvents[] }) {
  return (
    <div className="border-t border-outline-variant pt-5">
      <h4 className="mb-2 font-label-md text-[13px] text-primary">Sessions « connecté en tant que »</h4>
      {sessions.length === 0 ? (
        <p className="text-xs text-on-surface-variant">Aucun administrateur ne s&apos;est connecté en tant que ce membre.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {sessions.map((s) => {
            const active = s.started_at && !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
            return (
              <li key={s.id} className="text-xs border border-outline-variant rounded p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-on-surface font-medium">{s.admin_email || '—'}</span>
                  <span
                    className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.mode === 'write' ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'
                    }`}
                  >
                    {modeLabel(s.mode)}
                  </span>
                </div>
                <p className="mt-1 text-on-surface-variant">
                  Lien généré le {formatDateTime(s.created_at)}
                  {!s.started_at ? (
                    ' · non utilisé'
                  ) : active ? (
                    <span className="font-semibold text-green-700"> · en cours</span>
                  ) : (
                    <> · {formatDateTime(s.started_at)} → {s.ended_at ? formatDateTime(s.ended_at) : 'expirée'}</>
                  )}
                  {s.eventCount > 0 && ` · ${s.eventCount} action${s.eventCount > 1 ? 's' : ''}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Historique de connexion (horodatage seul) : lu depuis le journal d'audit
// natif de Supabase Auth via `GET /api/admin/membres/[id]/connexions` — pas
// de détail de pages vues, cf. CLAUDE.md doctrine egress. Chargé à l'ouverture
// de la section, comme `AiUsageDetail` ci-dessous.
function LoginHistory({ userId }: { userId: string }) {
  const [history, setHistory] = useState<LoginHistoryEntry[] | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/admin/membres/${userId}/connexions`)
      .then((r) => r.json())
      .then((data) => {
        if (!annule) setHistory(data?.history ?? []);
      })
      .catch(() => {
        if (!annule) setHistory([]);
      });
    return () => {
      annule = true;
    };
  }, [userId]);

  const ACTION_LABELS: Record<string, string> = {
    login: 'Connexion',
    logout: 'Déconnexion',
    user_signedup: 'Inscription',
    token_refreshed: 'Session prolongée',
  };

  return (
    <div className="border-t border-outline-variant pt-5">
      <h4 className="mb-2 font-label-md text-[13px] text-primary">Historique de connexion</h4>
      {history === null ? (
        <p className="text-xs text-on-surface-variant">Chargement…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-on-surface-variant">Aucune connexion enregistrée.</p>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto">
          {history.map((h, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="text-on-surface">{ACTION_LABELS[h.action] ?? h.action}</span>
              <span className="text-on-surface-variant">{formatDateTime(h.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Bloc « Consommation IA » de la fiche membre : mois + total (déjà connus,
// venus de la liste), et les derniers appels — chargés à l'ouverture, RLS
// admin (`ai_usage_select_admin`), sans passer par une route dédiée.
function AiUsageDetail({ userId, coutMois, coutTotal }: { userId: string; coutMois: number; coutTotal: number }) {
  const [appels, setAppels] = useState<
    { created_at: string; feature_label: string; model: string; tokens: number; cout_usd: number | null; status: string }[] | null
  >(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert || appels !== null) return;
    let annule = false;
    // `ai_usage` n'est pas encore dans lib/database.types.ts tant que la
    // migration n'a pas été régénérée — cast local, même motif que
    // lib/admin.ts.
    (createClient() as any)
      .from('ai_usage')
      .select(
        'created_at, feature, model, status, input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens, cost_usd, ai_features(label)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (annule) return;
        if (error) {
          console.error('AiUsageDetail:', error.message);
          setAppels([]);
          return;
        }
        type Row = {
          created_at: string;
          feature: string;
          model: string;
          status: string;
          input_tokens: number;
          cache_creation_tokens: number;
          cache_read_tokens: number;
          output_tokens: number;
          cost_usd: number | string | null;
          ai_features: { label: string } | { label: string }[] | null;
        };
        const rows = ((data as unknown as Row[]) ?? []).map((r) => ({
          created_at: r.created_at,
          feature_label: Array.isArray(r.ai_features) ? r.ai_features[0]?.label ?? r.feature : r.ai_features?.label ?? r.feature,
          model: r.model,
          tokens: r.input_tokens + r.cache_creation_tokens + r.cache_read_tokens + r.output_tokens,
          cout_usd: r.cost_usd == null ? null : Number(r.cost_usd),
          status: r.status,
        }));
        setAppels(rows);
      });
    return () => {
      annule = true;
    };
  }, [ouvert, appels, userId]);

  return (
    <div className="border border-outline-variant rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-low hover:bg-surface-container-high transition-colors text-left"
      >
        <span className="text-sm font-semibold text-on-surface">Consommation IA</span>
        <span className="text-xs text-on-surface-variant">
          {formatUsd(coutMois)} ce mois · {formatUsd(coutTotal)} au total
        </span>
      </button>
      {ouvert && (
        <div className="px-4 py-3 border-t border-outline-variant">
          {appels === null ? (
            <p className="text-xs text-on-surface-variant">Chargement…</p>
          ) : appels.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Aucun appel IA enregistré.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {appels.map((a, i) => (
                <li key={i} className="flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <p className="text-on-surface truncate">{a.feature_label}</p>
                    <p className="text-on-surface-variant">
                      {formatDate(a.created_at)} · {a.model} · {a.tokens.toLocaleString('fr-FR')} tokens
                      {a.status !== 'success' && <span className="text-error"> · échec</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-on-surface font-medium">{a.cout_usd == null ? '—' : formatUsd(a.cout_usd)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}
