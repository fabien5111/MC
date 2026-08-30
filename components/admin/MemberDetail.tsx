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
import type { Member, VisitSessionRow, MemberRecentRecipe, MemberRecentBatch, MemberRecentComment } from '@/lib/admin';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatUsd } from '@/lib/ai/cost';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { withImpersonationSchema, type ImpersonationMode } from '@/lib/impersonation-types';
import { useImpersonateLink, ImpersonationLinkPanel } from '@/components/admin/ImpersonateButton';
import { MemberSubscriptionPanel } from '@/components/admin/MemberSubscriptionPanel';

const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';
const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

function inviteLinkFor(email: string): string {
  return `${window.location.origin}/connexion?invite=${encodeURIComponent(email)}`;
}

// Bloc à en-tête repliable, replié par défaut — motif commun à toutes les
// sections de la fiche (identité, impersonation, abonnement, suppression…) :
// une fiche complète en un seul écran ne doit pas obliger à tout parcourir
// pour trouver une action précise.
function CollapsibleSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-outline-variant rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 bg-surface-container-low hover:bg-surface-container-high transition-colors text-left"
      >
        <h3 className="font-headline-md text-base font-semibold">{title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {subtitle && <span className="text-xs text-on-surface-variant">{subtitle}</span>}
          <span className="material-symbols-outlined text-on-surface-variant">{open ? 'expand_less' : 'expand_more'}</span>
        </div>
      </button>
      {open && <div className="px-6 py-6 space-y-5">{children}</div>}
    </div>
  );
}

export function MemberDetail({
  member,
  stats,
  recent,
  visitSessions,
}: {
  member: Member;
  stats: { followers: number; following: number; batches: number };
  recent: { recipes: MemberRecentRecipe[]; batches: MemberRecentBatch[]; comments: MemberRecentComment[] };
  visitSessions: VisitSessionRow[];
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
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {member.profileId && (
            <button
              type="button"
              onClick={connecterEnTantQue}
              disabled={impBusy}
              className="flex items-center gap-1 rounded-pill border border-outline-variant px-4 py-2 text-[12.5px] font-semibold text-primary hover:bg-surface-container disabled:opacity-50"
              title="Connecter en tant que ce membre"
            >
              <span className="material-symbols-outlined text-base">visibility</span>
              {impBusy ? 'Génération du lien…' : 'Connecter en tant que'}
            </button>
          )}
          {member.username && (
            <a
              href={`/u/${member.username}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 rounded-pill border border-outline-variant px-4 py-2 text-[12.5px] font-semibold text-primary hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span> Profil public
            </a>
          )}
        </div>
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

      {/* Activité récente */}
      {member.profileId && (
        <CollapsibleSection title="Activité récente">
          <RecentList
            label="Dernières recettes"
            empty="Aucune recette."
            items={recent.recipes.map((r) => ({
              key: r.id,
              href: `/recette/${r.id}`,
              title: r.title,
              meta: `${STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—'} · ${formatDate(r.created_at)}`,
            }))}
          />
          <RecentList
            label="Dernières fournées"
            empty="Aucune fournée."
            items={recent.batches.map((b) => ({
              key: b.id,
              href: `/fournee/${b.id}`,
              title: b.recipe_title || '(recette supprimée)',
              meta: `${BATCH_STATUS_LABELS[b.status] ?? b.status} · ${formatDate(b.created_at)}`,
            }))}
          />
          <RecentList
            label="Derniers commentaires"
            empty="Aucun commentaire."
            items={recent.comments.map((c) => ({
              key: c.id,
              href: c.recipe_id ? `/recette/${c.recipe_id}` : undefined,
              title: c.recipe_title || '(recette supprimée)',
              meta: `${c.rating != null ? `${c.rating}/5 · ` : ''}${COMMENT_STATUS_LABELS[c.status ?? ''] ?? c.status ?? '—'} · ${formatDate(c.created_at)}`,
              detail: c.content,
            }))}
          />
        </CollapsibleSection>
      )}

      {/* Identité / statut */}
      <CollapsibleSection title="Identité et statut">
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
      </CollapsibleSection>

      {/* Impersonation */}
      {member.profileId && (
        <CollapsibleSection title="Connexion « en tant que »">
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
        </CollapsibleSection>
      )}

      {/* Connexions du membre */}
      {member.profileId && (
        <CollapsibleSection title="Connexions du membre">
          <VisitSessionsList sessions={visitSessions} />
        </CollapsibleSection>
      )}

      {/* Abonnement */}
      {member.profileId && (
        <CollapsibleSection title="Abonnement">
          <MemberSubscriptionPanel memberId={member.profileId} />
        </CollapsibleSection>
      )}

      {/* Suppression */}
      <CollapsibleSection title="Zone de danger">
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
      </CollapsibleSection>

      {impersonation && <ImpersonationLinkPanel link={impersonation} onClose={clearImpersonation} />}
    </main>
  );
}

const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', pending: 'En attente', published: 'Publiée', rejected: 'Refusée' };
const BATCH_STATUS_LABELS: Record<string, string> = { planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée', abandonnee: 'Abandonnée' };
const COMMENT_STATUS_LABELS: Record<string, string> = { pending: 'À modérer', approved: 'Publié', rejected: 'Refusé', spam: 'Spam' };

// Une liste d'aperçu (recettes/fournées/commentaires) de la section
// « Activité récente » — même formes de ligne (titre + méta + lien optionnel),
// factorisée pour ne pas répéter trois fois le même balisage.
function RecentList({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: { key: string | number; href?: string; title: string; meta: string; detail?: string }[];
}) {
  return (
    <div>
      <h4 className="mb-2 font-label-md text-[13px] text-primary">{label}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const content = (
              <>
                <p className="text-on-surface truncate">{item.title}</p>
                <p className="text-on-surface-variant">{item.meta}</p>
                {item.detail && <p className="text-on-surface-variant italic truncate">« {item.detail} »</p>}
              </>
            );
            return (
              <li key={item.key} className="text-xs border border-outline-variant rounded p-2.5">
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noreferrer noopener" className="block hover:text-primary">
                    {content}
                  </a>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Sessions de visite (date de connexion, dernière activité, nombre de pages
// vues) — chargées côté serveur avec le reste de la fiche (`page.tsx`,
// `getMemberVisitSessions`), pas de fetch client dédié : c'est une simple
// lecture bornée (15 lignes), au même titre que les listes d'activité
// récente. Alimentées par `components/VisitTracker.tsx`, monté sur tout le
// site — compteurs seuls, jamais le détail des pages (cf. CLAUDE.md doctrine
// egress).
function VisitSessionsList({ sessions }: { sessions: VisitSessionRow[] }) {
  if (sessions.length === 0) {
    return <p className="text-xs text-on-surface-variant">Aucune session enregistrée.</p>;
  }
  return (
    <ul className="space-y-1.5 max-h-64 overflow-y-auto">
      {sessions.map((s) => {
        const dureeMin = Math.max(0, Math.round((new Date(s.last_seen_at).getTime() - new Date(s.started_at).getTime()) / 60_000));
        return (
          <li key={s.id} className="flex items-center justify-between text-xs">
            <span className="text-on-surface">{formatDateTime(s.started_at)}</span>
            <span className="text-on-surface-variant">
              {dureeMin > 0 ? `${dureeMin} min` : '< 1 min'} · {s.page_count} page{s.page_count > 1 ? 's' : ''}
            </span>
          </li>
        );
      })}
    </ul>
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
